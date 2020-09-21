import { Interval, Workout } from "../ast";
import { ParseError } from "./ParseError";
import { isIntervalLabelTokenValue, SourceLocation, Token } from "./tokenizer";

type Header = Partial<Omit<Workout, "intervals">>;

const extractText = (tokens: Token[]): [string, Token[]] => {
  let text;
  while (tokens[0] && tokens[0].type === "text") {
    if (text === undefined) {
      text = tokens[0].value;
    } else {
      text += "\n" + tokens[0].value;
    }
    tokens.shift();
  }
  return [text ? text.trim() : "", tokens];
};

const parseHeader = (tokens: Token[]): [Header, Token[]] => {
  const header: Header = {};

  while (tokens[0]) {
    const token = tokens[0];
    if (token.type === "text" && token.value === "") {
      // Ignore empty lines before header
      tokens.shift();
    } else if (token.type === "label" && token.value === "Name") {
      tokens.shift();
      const [name, rest] = extractText(tokens);
      header.name = name;
      tokens = rest;
    } else if (token.type === "label" && token.value === "Author") {
      tokens.shift();
      const [author, rest] = extractText(tokens);
      header.author = author;
      tokens = rest;
    } else if (token.type === "label" && token.value === "Description") {
      tokens.shift();
      const [description, rest] = extractText(tokens);
      header.description = description;
      tokens = rest;
    } else {
      // End of header
      break;
    }
  }

  return [header, tokens];
};

type IntervalData = Omit<Interval, "type">;

const parseIntervalParams = (
  tokens: Token[],
  loc: SourceLocation
): [IntervalData, Token[]] => {
  const data: Partial<IntervalData> = {};

  while (tokens[0]) {
    const token = tokens[0];
    if (token.type === "duration") {
      data.duration = token.value;
      tokens.shift();
    } else if (token.type === "cadence") {
      data.cadence = token.value;
      tokens.shift();
    } else if (token.type === "intensity") {
      data.intensity = { from: token.value, to: token.value };
      tokens.shift();
    } else if (token.type === "intensity-range") {
      data.intensity = { from: token.value[0], to: token.value[1] };
      tokens.shift();
    } else {
      break;
    }
  }

  if (!("duration" in data)) {
    throw new ParseError("Duration not specified", loc);
  }
  if (!("intensity" in data)) {
    throw new ParseError("Power not specified", loc);
  }

  return [data as IntervalData, tokens];
};

const parseIntervals = (tokens: Token[]): Interval[] => {
  const intervals: Interval[] = [];

  while (tokens[0]) {
    const token = tokens.shift() as Token;
    if (token.type === "label" && isIntervalLabelTokenValue(token.value)) {
      const [{ duration, intensity, cadence }, rest] = parseIntervalParams(
        tokens,
        token.loc
      );
      intervals.push({
        type: token.value,
        duration,
        intensity,
        cadence,
      });
      tokens = rest;
    } else if (token.type === "text" && token.value === "") {
      // Ignore empty lines
    } else {
      throw new ParseError(
        `Unexpected token [${token.type} ${token.value}]`,
        token.loc
      );
    }
  }

  return intervals;
};

export const parseTokens = (tokens: Token[]): Workout => {
  const [header, intervalTokens] = parseHeader(tokens);

  if (header.name === undefined) {
    throw new ParseError(
      "Workout is missing a name. Use `Name:` to declare one.",
      { row: 0, col: 0 }
    );
  }

  return {
    name: header.name,
    author: header.author || "",
    description: header.description || "",
    intervals: parseIntervals(intervalTokens),
  };
};
