# Come KinderGrimm genera le immagini

Questa analisi si riferisce al commit KinderGrimm registrato in
[`references/kindergrimm.reference.json`](../references/kindergrimm.reference.json).
Il checkout locale è materiale di studio e non viene incluso nel repository:
l'upstream non espone una licenza nel commit analizzato.

## Risposta breve

KinderGrimm non usa immagini pre-renderizzate né un modello generativo. Costruisce
una descrizione semantica casuale ma riproducibile del soggetto, disegna ogni
parte su un piccolo `HTMLCanvasElement` con primitive 2D volutamente instabili,
carica i canvas come `THREE.CanvasTexture` e monta i piani risultanti su una
gerarchia di `THREE.Group` animabili.

```text
seed
  -> parametri semantici
  -> layout e punti di ancoraggio
  -> forme vettoriali temporanee
  -> segni raster Canvas 2D
  -> CanvasTexture su piani Three.js
  -> rig: trasformazioni ossee + sostituzione delle texture
```

Il carattere “disegnato a mano” non dipende da un filtro applicato alla fine.
Nasce nel modo in cui ogni contorno e riempimento viene rasterizzato.

## 1. Due casualità con responsabilità diverse

In `src/rng.js` l'upstream usa `mulberry32` e un hash FNV-1a a 32 bit. Il seed
del personaggio determina i parametri persistenti: specie, proporzioni, occhi,
capelli, palette e così via. La stessa ricetta ricostruisce quindi lo stesso
soggetto.

Ogni ridisegno riceve invece un seed derivato da:

```text
recipe seed + part name + state + boil frame
```

Questa seconda casualità modifica soltanto il gesto: tremolio, pressione,
granulosità, piccoli scarti del tratto. Non deve cambiare l'identità della forma.

Nella libreria TypeScript la separazione è resa esplicita da `SeedTree` e
`combineSeed`. Ogni decisione ha un namespace (`character:head`,
`scenery:palette`, `asset:boil:...`). Aggiungere un'estrazione casuale alla
facciata di un palazzo non ricrea per errore la faccia del personaggio. È una
correzione importante: una singola sequenza RNG globale è deterministica, sì,
ma fragile come un castello di carte molto disciplinato.

## 2. Il tratto non è una normale linea Canvas

Il metodo centrale è `Sketch.stroke`. La polilinea iniziale viene:

1. ricampionata a distanza quasi uniforme;
2. perturbata lungo la normale con più onde a frequenze diverse;
3. convertita in un nastro con larghezza variabile e taper alle estremità;
4. riempita come poligono semitrasparente;
5. sporcata con frammenti di grafite dentro e oltre il bordo;
6. erosa con piccoli frammenti color carta;
7. talvolta ripetuta come tratto fantasma disallineato;
8. estesa con overshoot che simulano il colpo di polso.

`brokenStroke` spezza inoltre i contorni lunghi in due o tre passate
sovrapposte. Per questo il risultato non sembra una `ctx.stroke()` a cui sia
stato aggiunto rumore uniforme: conserva direzione, pressione e intenzione del
gesto.

Le forme organiche usano punti circolari perturbati, spline Chaikin e blob con
armoniche a frequenze diverse. I riempimenti sono tecniche indipendenti:
hatching, scribble, stipple, grafite piena, wash, olio, gesso e marker.

## 3. Il medium è una strategia, non un colore

`src/media.js` espone per ogni medium tre operazioni:

- `tone`: massa e valore della forma;
- `skin`: colore della superficie;
- `edge`: contorno;

Una parte descrive la propria geometria e una densità semantica (`light`,
`hatch`, `black`); il medium decide come renderla. Acquerello significa più
lavature trasparenti e bleed, grafite significa hatching e granuli, olio usa
passate dense. La libreria mantiene lo stesso confine in
`src/materials/medium.ts`, così una nuova costruzione e un nuovo personaggio
possono condividere davvero la grammatica grafica.

## 4. Ricetta, layout e disegno sono fasi distinte

Il repository di riferimento separa già tre concetti utili:

- la ricetta contiene l'identità serializzabile;
- il layout traduce i parametri in misure e punti di ancoraggio;
- le parti disegnano sulle superfici ricevute.

Il port TypeScript irrigidisce questo modello:

| Fase | Tipo pubblico | Responsabilità |
| --- | --- | --- |
| Identità | `CharacterRecipe`, `PropRecipe`, `SceneryRecipe` | dato JSON completo e versionato |
| Geometria | layout e `AssetBlueprint` | layer, bone, bounds, socket e collider |
| Raster | callback `LayerDefinition.draw` | segni Canvas 2D deterministici |
| Runtime | `SpriteRig` | texture, piani, stati, animazione e disposal |

Il collider viene derivato dagli stessi parametri del disegno. La fisica non
legge l'alpha della texture: sarebbe costosa, instabile e concettualmente
sbagliata per un gioco.

## 5. Dal Canvas al rig Three.js

`src/part.js` del riferimento crea più ridisegni per ogni stato. Lo stato
iniziale viene generato subito; gli altri, come occhi chiusi o bocca aperta,
sono costruiti al primo utilizzo. Ogni canvas diventa una `CanvasTexture` su un
`PlaneGeometry` trasparente con un pivot scelto dalla parte.

Il port conserva il caricamento lazy e aggiunge:

- gerarchie parent/child esplicite tra le ossa;
- validazione degli anchor conflittuali e dei cicli;
- gestione centralizzata delle risorse GPU e `dispose()` idempotente;
- spazio colore sRGB e filtri coerenti per canvas non power-of-two;
- API tipizzate per stato, frame e posa;
- blocchi `drawRank` contigui, così un fondale non può inserirsi tra torso e
  testa di un personaggio trasparente;
- factory del canvas iniettata, compatibile con DOM e `OffscreenCanvas`.

Il line-boil non interpola i pixel. A cadenze leggermente diverse per layer,
sostituisce la texture con una delle varianti ridisegnate. La desincronizzazione
evita che tutta la figura pulsi come un unico adesivo.

## 6. Animazione

L'animazione visiva combina due meccanismi:

- trasformazioni dei bone: rotazione di arti e testa, respiro, rimbalzo;
- sostituzione di stato: blink, gaze, bocca aperta.

L'upstream usa ancora `Math.random()` in diversi comportamenti autonomici
dell'animatore. Il personaggio resta semanticamente riproducibile, ma la sua
sequenza temporale non lo è. `CharacterAnimator` usa invece un RNG dedicato
derivato dal seed della ricetta: a parità di aggiornamenti temporali, blink e
sguardi si ripetono.

## Correzioni effettuate nel port

- Eliminata la casualità nascosta dalla libreria e dall'animatore.
- Separati i namespace RNG per evitare effetti a cascata tra generatori.
- Persistiti tutti i parametri semantici nelle ricette versionate.
- Corretto l'overshoot affinché il calcolo dell'estremità non usi un punto già
  mutato.
- Resi espliciti parent bone, pivot e anchor; gli occhi e la bocca seguono la
  testa invece di doverne imitare a mano il moto.
- Verificato il pivot degli arti: il valore verticale `1` identifica il bordo
  superiore del piano, quindi spalla o anca, mentre gli asset appoggiati al
  terreno usano `0`.
- Allineata la massa disegnata del torso alle dimensioni dichiarate dal layout
  e portate le braccia davanti al torso, come nel rig di riferimento: un pivot
  corretto non serve a molto se il layer dell'arto viene poi coperto per intero.
- Separati collider e socket dal raster e derivati dallo stesso layout.
- Aggiunti controllo delle risorse, tipi strict, errori per stati invalidi e
  factory delle superfici testabile.
- Rimossa la dipendenza implicita dal DOM dal nucleo di disegno.

## Come estendere il sistema a un editor di livelli

Per aggiungere un oggetto non si modifica `SpriteRig`:

1. creare una ricetta JSON versionata;
2. calcolare misure, socket e collider;
3. restituire un `AssetBlueprint` con uno o più layer;
4. disegnare le forme usando `Sketch` e un `Medium`;
5. istanziare lo stesso blueprint nel gioco con `SpriteRig`.

Il playground applica questa sequenza a personaggi, casse, lanterne, arbusti,
cartelli, piattaforme e palazzi. Il documento dell'editor conserva tipo, seed,
medium e trasformazione; il catalogo ricostruisce i blueprint. Le case vengono
ridisegnate semanticamente quando cambiano larghezza o altezza, così numero e
disposizione di finestre restano coerenti invece di limitarsi a stirare una
texture. Costruzioni e oggetti non ricevono uno stile “simile” a posteriori:
usano esattamente gli stessi generatori di tratto, riempimento, colore e boil.

## Limiti intenzionali

- La geometria e i parametri sono riproducibili; i pixel possono differire
  leggermente tra rasterizzatori Canvas di browser diversi.
- Ogni frame di boil occupa una texture: folle numerose richiedono meno frame,
  risoluzione inferiore o compositing statico.
- L'attuale libreria porta il meccanismo centrale e un set rappresentativo di
  asset, non ogni editor, specie, posa e oggetto presenti nell'applicazione
  KinderGrimm.
