/**
 * Rend un type (et tout ce qu'il contient) en lecture seule. Le rendu reçoit l'état du moteur
 * sous cette forme : toute tentative de l'écrire est une erreur de compilation (SPECS §8).
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
