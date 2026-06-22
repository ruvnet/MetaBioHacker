// Real-slice calibration types. Real CT/MRI slices are calibration TARGETS for
// the acoustic engine — they are NOT ultrasound-CT. Mean Dice hides the detail
// that matters, so we score Dice by region and gate headline inclusion behind a
// domain-gap score (ADR-0024).

export type Region = "air" | "bone" | "fluid" | "softTissue" | "fat" | "unknown";

export type RegionDiceScore = {
  region: Region;
  dice: number;
  intersection: number;
  predictedArea: number;
  targetArea: number;
};

export type RealSliceEvaluation = {
  sliceId: string;
  bodyRegion: "abdomen" | "thorax" | "head" | "pelvis";
  meanDice: number;
  regionDice: RegionDiceScore[];
  registrationErrorPx: number;
  domainGapScore: number;
  classification: "headline" | "researchOnly" | "exclude";
  usableForBenchmark: boolean;
};

// The five acoustic classes (engine output) mapped to calibration regions.
// Index order matches sonic_ct Tissue: water, fat, muscle, organ, bone.
export const CLASS_TO_REGION: Region[] = ["fluid", "fat", "softTissue", "softTissue", "bone"];
