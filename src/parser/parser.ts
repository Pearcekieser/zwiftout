import { Interval, Workout, Comment } from "../ast";
import { Duration } from "../Duration";
import { FreeIntensity, Intensity, IntensityRange } from "../Intensity";
import { ParseError } from "./ParseError";
import { IntervalType, SourceLocation, Token } from "./tokenizer";

type Header = Partial<Omit<Workout, "intervals">>;

const tokenToString = (token: Token | undefined): string => {
  return token ? `[${token.type} ${token.value}]` : "EOF";
};

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
    if (token.type === "header" && token.value === "Name") {
      tokens.shift();
      const [name, rest] = extractText(tokens);
      header.name = name;
      tokens = rest;
    } else if (token.type === "header" && token.value === "Author") {
      tokens.shift();
      const [author, rest] = extractText(tokens);
      header.author = author;
      tokens = rest;
    } else if (token.type === "header" && token.value === "Description") {
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

const parseIntervalComments = (tokens: Token[]): [Comment[], Token[]] => {
  const comments: Comment[] = [];
  while (tokens[0]) {
    const [start, offset, text, ...rest] = tokens;
    if (start.type === "comment-start") {
      if (!offset || offset.type !== "duration") {
        throw new ParseError(
          `Expected [comment offset] instead got ${tokenToString(offset)}`,
          offset?.loc || start.loc,
        );
      }
      if (!text || text.type !== "text") {
        throw new ParseError(`Expected [comment text] instead got ${tokenToString(text)}`, text?.loc || offset.loc);
      }
      comments.push({
        offset: new Duration(offset.value),
        text: text.value,
      });
      tokens = rest;
    } else {
      break;
    }
  }
  return [comments, tokens];
};

const parseIntervalParams = (type: IntervalType, tokens: Token[], loc: SourceLocation): [Interval, Token[]] => {
  let duration;
  let cadence;
  let intensity;

  while (tokens[0]) {
    const token = tokens[0];
    if (token.type === "duration") {
      duration = new Duration(token.value);
      tokens.shift();
    } else if (token.type === "cadence") {
      cadence = token.value;
      tokens.shift();
    } else if (token.type === "intensity") {
      intensity = new Intensity(token.value);
      tokens.shift();
    } else if (token.type === "intensity-range") {
      intensity = new IntensityRange(token.value[0], token.value[1]);
      tokens.shift();
    } else {
      break;
    }
  }

  if (!duration) {
    throw new ParseError("Duration not specified", loc);
  }
  if (!intensity) {
    if (type === "FreeRide") {
      intensity = new FreeIntensity();
    } else {
      throw new ParseError("Power not specified", loc);
    }
  }

  const [comments, rest] = parseIntervalComments(tokens);

  return [{ type, duration, intensity, cadence, comments }, rest];
};

const parseIntervals = (tokens: Token[]): Interval[] => {
  const intervals: Interval[] = [];

  while (tokens[0]) {
    const token = tokens.shift() as Token;
    if (token.type === "interval") {
      const [interval, rest] = parseIntervalParams(token.value, tokens, token.loc);
      intervals.push(interval);
      tokens = rest;
    } else {
      throw new ParseError(`Unexpected token ${tokenToString(token)}`, token.loc);
    }
  }

  return intervals;
};

export const parseTokens = (tokens: Token[]): Workout => {
  const [header, intervalTokens] = parseHeader(tokens);

  if (header.name === undefined) {
    throw new ParseError("Workout is missing a name. Use `Name:` to declare one.", { row: 0, col: 0 });
  }

  return {
    name: header.name,
    author: header.author || "",
    description: header.description || "",
    intervals: parseIntervals(intervalTokens),
  };
};
