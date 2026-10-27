// Unity calcule en float 32 bits, JavaScript en 64. Pour rester bit à bit fidèle (les collisions
// utilisent des bornes inclusives), chaque opération arithmétique sur une position, un rect, une
// vitesse ou un timer est arrondie en float 32 bits.
// fround(a * b) en double donne exactement le résultat d'un produit float32 (idem + - /).

export const f32 = Math.fround;

/** `Time.deltaTime` dans `FixedUpdate` : `Fixed Timestep` = 0.02 (ProjectSettings/TimeManager.asset). */
export const DT = f32(0.02);
