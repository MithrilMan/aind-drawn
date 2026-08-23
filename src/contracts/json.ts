export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = readonly JsonValue[];
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
