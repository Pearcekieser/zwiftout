import { chain } from "ramda";
import { Interval } from "../ast";

// Converts interval to array of intensity values for each second
const intervalToIntensities = ({ duration, intensity }: Interval): number[] => {
  const seconds = [];
  const { from, to } = intensity;
  for (let i = 0; i < duration.seconds; i++) {
    // Intensity in a single second
    seconds.push(from + (to - from) * (i / duration.seconds));
  }
  return seconds;
};

export const intervalsToIntensities = chain(intervalToIntensities);
