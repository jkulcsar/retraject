import type { LawId, TrajectoryLaw } from "../law";
import { bangBang } from "./bangBang";
import { cubic } from "./cubic";
import { linear } from "./linear";
import { quintic } from "./quintic";
import { trapezoidal } from "./trapezoidal";

export { bangBang, cubic, linear, quintic, trapezoidal };

/** All laws, in the order the 1997 UI listed them (legacy/JOINTYP.H). */
export const LAWS: Record<LawId, TrajectoryLaw> = {
  linear,
  cubic,
  quintic,
  bangBang,
  trapezoidal,
};

export const ALL_LAWS: readonly TrajectoryLaw[] = Object.values(LAWS);
