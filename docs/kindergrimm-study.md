# Come KinderGrimm genera le immagini

Questa analisi si riferisce al commit KinderGrimm registrato in
[`references/kindergrimm.reference.json`](../references/kindergrimm.reference.json).
Il checkout locale è materiale di studio e non viene incluso nel repository:
l'upstream, dalla revisione attualmente fissata, dedica il codice al pubblico
dominio tramite Unlicense.

## Risposta breve

KinderGrimm non usa immagini pre-renderizzate né un modello generativo. Costruisce
una descrizione semantica casuale ma riproducibile del soggetto. Il percorso
originale disegna ogni parte su un piccolo `HTMLCanvasElement`, carica i canvas
come `THREE.CanvasTexture` e monta i piani su una gerarchia animabile. Il ramo
attuale aggiunge due rappresentazioni parallele: solidi lisci procedurali
(`src/gloss`) e personaggi voxel (`src/voxel`).

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
| Identità | `CharacterIdentityRecipe`, `BuildingIdentityRecipe`, `VehicleIdentityRecipe` | dato semantico JSON completo e versionato |
| Rappresentazione | `CharacterRecipe`, `SolidCharacterRecipe` | medium, finitura e policy proprie della tecnica |
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
sequenza temporale non lo è. Il port valuta invece blink e sguardi attraverso
finestre temporali assolute derivate da namespace seedati. Identità, stato e
tempo uguali producono lo stesso `CharacterMotionSample` anche con seek diretto,
senza dipendere dal numero di frame già eseguiti.

## 7. Facce 3D: la superficie è un contratto condiviso

`src/gloss` non estrude lo sprite. Genera un rig volumetrico composto da mesh
semantiche separate. Il corpo può essere un superellissoide parametrico oppure
una forma modellata da una control cage e suddivisa con Catmull-Clark. Occhi,
pupille, palpebre, sopracciglia, nasi e bocche sono solidi o profili 2D estrusi
con bevel: il rilievo fa parte della geometria, non di una normal map decorativa.

Il passaggio fondamentale è `glayout.js`. Per ogni coordinata facciale calcola
il punto esatto sulla superficie e la sua normale. Per i superellissoidi usa la
stessa equazione analitica che genera i vertici; per rock e slime esegue raycast
sulla stessa mesh suddivisa che verrà renderizzata. `basisAt` ricava normale,
tangente e asse verticale locale per orientare il profilo estruso. Di
conseguenza cambiare una testa da sferica a squadrata non richiede offset Three.js
ritoccati a mano: le feature seguono il volume.

Le parti separate sono anche l'interfaccia di animazione. `gface.js` applica
blink, saccadi, follow della testa ed espressioni come trasformazioni rispetto
alla posa di riposo. Occhi e testa usano due molle criticamente smorzate con
soluzione chiusa: l'occhio arriva prima, la testa lo segue più lentamente e
nessun frame lungo può far esplodere l'integrazione numerica. Le mesh non vengono
ricostruite durante l'animazione.

Nel port questo diventa un confine pubblico, non un sottoprogetto gloss:

- `CharacterIdentityRecipe` è la fonte semantica condivisa con la versione a matita;
- `SolidCharacterRecipe` aggiunge solo finitura, profondità e policy della rappresentazione;
- `SolidAssetBlueprint` contiene solo dati serializzabili;
- `SolidGeometrySpec` descrive superellissoidi, profili estrusi e mesh;
- `SurfaceAnchor` unifica punto, normale e roll;
- `SolidMaterialSpec` dichiara ruolo cromatico e finitura fisica;
- `SolidRig` è l'adapter Three.js e possiede le risorse GPU;
- `sampleCharacterMotion` produce locomozione, espressione e moto autonomico
  come dato semantico immutabile;
- `applySolidCharacterMotion` proietta quel dato sui nodi e sulle parti senza
  rebuild né accumulo di trasformazioni.

La scena fotografica, le softbox e il crowd layout restano fuori: sono politiche
di presentazione. Il core conserva invece ciò che serve anche a un gioco 2.5D,
a una scena 3D o a un renderer differente.

## 8. Voxel: una seconda tecnica, non un caso speciale dei solidi

`src/voxel` introduce un'altra idea di valore: `Carve` è una API di authoring a
griglia con `set`, `dab`, `disc`, `blob`, `stroke` e simmetria. `dab` colora solo
cellule già occupate, quindi occhi, macchie e calzini non possono galleggiare
fuori dalla silhouette. Il mesher elimina facce interne rispetto all'occupancy
dell'intero personaggio, applica ambient occlusion per vertice e mantiene mesh
separate per parte e stato.

Questa tecnica non è stata infilata in `SolidGeometrySpec`: una voxel field ha
invarianti diversi da una superficie liscia — ownership delle celle, culling
globale tra parti, plate audit tra stati e vertex color. Va importata come terza
rappresentazione pubblica quando avrà il proprio blueprint e runtime, non come
un flag `voxel: true` appeso a `SolidRig`. Elegante, peccato che quel flag
risolverebbe il problema sbagliato.

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
- Resi serializzabili i blueprint solidi e confinati Three.js, materiali e
  risorse GPU nel runtime.
- Unificati placement delle feature e generazione della mesh sulla stessa
  equazione di superficie 3D.
- Portata l'animazione facciale a transform con molle stabili e posa di riposo,
  senza rebuild della geometria.

## Aggiornamento upstream `3c36934..47a996a`

Il delta revisionato il 20 agosto 2026 aggiunge quattro idee architetturali utili:

- il casting gloss umanoide ora separa capelli, outfit e frame corporeo e usa
  guardrail cromatici tra pelle, capelli e tessuti;
- `src/obj` introduce una famiglia procedurale di piante composta da mound,
  stem, leaves e bloom, coordinati dagli anchor `rootY` e `crownY`;
- `src/photo.js` compone una scena per ingombri misurati, con una linea
  principale ordinata per scala, un fronte di soggetti piccoli, vegetazione di
  fondale e cluster sospesi.
- `src/gloss` e `src/voxel` dimostrano che ricetta, layout e parti semantiche
  sopravvivono al passaggio da piani disegnati a vere geometrie 3D.

Nel framework sono state adattate le idee di authoring e solidi lisci. Il
prototipo `plant` è stato successivamente rimosso dal prodotto: non aveva un
consumer attivo e conservarlo come API pubblica avrebbe confuso materiale di
studio con una famiglia supportata. I personaggi ottengono
palette con contrasto controllato, silhouette dei capelli realmente distinte,
un layer outfit e mani colorate visibili. Il frame Rayman senza arti non è stato
portato: funziona per statuine frontali, ma rimuoverebbe informazione proprio al
rig destinato a locomozione e interazioni. `src/assets/character/identity`
mantiene ora specie, palette, proporzioni e tratti facciali una sola volta;
`src/assets/character/raster` e `src/assets/character/solid` li proiettano
rispettivamente nel raster a matita e in un rig volumetrico completo. Il
componente `src/assets/character/solid/face` monta occhi, bocca, naso e capelli sulla
superficie della testa ed è riusato anche dal blueprint completo. Il runtime
solido porta profili estrusi, materiali fisici, articolazioni corporee,
locomozione e animazione facciale 3D.

Il packer fotografico resta documentato ma fuori dal core. Diventerà sensato
quando un editor avrà un comando esplicito di auto-composizione basato sui
bounds; anticiparlo ora significherebbe aggiungere una politica di scena senza
un caso d'uso che possa verificarla. N8AO, SEO e share-card sono invece dettagli
dell'applicazione upstream, non capacità della libreria di disegno.

## Come estendere il sistema a un editor di livelli

Per aggiungere un oggetto non si modifica il runtime:

1. creare una ricetta JSON versionata; se esistono più rappresentazioni,
   separare identità semantica e policy della tecnica;
2. calcolare misure, socket e collider;
3. scegliere una rappresentazione e restituire un blueprint con parti semantiche;
4. per il raster, disegnare con `Sketch` e un `Medium`; per il volume, emettere
   `SolidGeometrySpec` e `SolidMaterialSpec`;
5. istanziare il blueprint nel gioco con `SpriteRig`, `SolidRig` o un adapter
   equivalente del consumer.

Il prototipo editor applicava questa sequenza a personaggi, piante multipart, casse,
lanterne, arbusti, cartelli, piattaforme e palazzi. Il documento dell'editor conserva tipo, seed,
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
- La rappresentazione voxel è stata studiata ma non ancora pubblicata: richiede
  un contratto proprio per occupancy, ownership delle celle e stati.
