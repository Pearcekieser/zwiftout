import { last } from "ramda";
import { Interval, Workout, Comment } from "../ast";
import { Duration } from "../Duration";
import { ConstantIntensity, FreeIntensity, RangeIntensity, RangeIntensityEnd } from "../Intensity";
import { ParseError } from "./ParseError";
import { IntervalType, OffsetToken, SourceLocation, Token } from "./tokenizer";

type Header = Partial<Omit<Workout, "intervals">>;

const FTP = 280; // TODO load ftp from headers

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
    } else if (token.type === "header" && token.value === "Tags") {
      tokens.shift();
      const [tags, rest] = extractText(tokens);
      header.tags = tags.split(/\s*,\s*/);
      tokens = rest;
    } else {
      // End of header
      break;
    }
  }

  return [header, tokens];
};

type PartialComment = {
  offsetToken: OffsetToken;
  text: string;
  loc: SourceLocation;
};

const parseIntervalComments = (tokens: Token[], intervalDuration: Duration): [Comment[], Token[]] => {
  const comments: PartialComment[] = [];
  while (tokens[0]) {
    const [start, offset, text, ...rest] = tokens;
    if (start.type === "comment-start") {
      if (!offset || offset.type !== "offset") {
        throw new ParseError(
          `Expected [comment offset] instead got ${tokenToString(offset)}`,
          offset?.loc || start.loc,
        );
      }
      if (!text || text.type !== "text") {
        throw new ParseError(`Expected [comment text] instead got ${tokenToString(text)}`, text?.loc || offset.loc);
      }
      comments.push({
        offsetToken: offset,
        text: text.value,
        loc: offset.loc,
      });
      tokens = rest;
    } else {
      break;
    }
  }

  return [computeAbsoluteOffsets(comments, intervalDuration), tokens];
};

const computeAbsoluteOffsets = (partialComments: PartialComment[], intervalDuration: Duration): Comment[] => {
  const comments: Comment[] = [];
  for (let i = 0; i < partialComments.length; i++) {
    const pComment = partialComments[i];
    const offsetToken = pComment.offsetToken;

    // Assume absolute offset by default
    let offset: Duration = new Duration(offsetToken.value);

    if (offsetToken.kind === "relative-plus") {
      // Position relative to previous already-computed comment offset
      const previousComment = last(comments);
      if (previousComment) {
        offset = new Duration(previousComment.offset.seconds + offset.seconds);
      }
    } else if (offsetToken.kind === "relative-minus") {
      // Position relative to next comment or interval end
      offset = new Duration(nextCommentOffset(partialComments, i, intervalDuration).seconds - offset.seconds);
    }

    comments.push({
      offset,
      loc: pComment.loc,
      text: pComment.text,
    });
  }
  return comments;
};

const nextCommentOffset = (partialComments: PartialComment[], i: number, intervalDuration: Duration): Duration => {
  const nextComment = partialComments[i + 1];
  if (!nextComment) {
    return intervalDuration;
  }
  switch (nextComment.offsetToken.kind) {
    case "relative-minus":
      return new Duration(
        nextCommentOffset(partialComments, i + 1, intervalDuration).seconds - nextComment.offsetToken.value,
      );
    case "relative-plus":
      throw new ParseError("Negative offset followed by positive offset", nextComment.offsetToken.loc);
    case "absolute":
    default:
      return new Duration(nextComment.offsetToken.value);
  }
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
    } else if (token.type === "watts") {
      intensity = new ConstantIntensity(token.value / FTP);
      tokens.shift();
    } else if (token.type === "intensity") {
      intensity = new ConstantIntensity(token.value);
      tokens.shift();
    } else if (token.type === "intensity-range") {
      intensity = new RangeIntensity(token.value[0], token.value[1]);
      tokens.shift();
    } else if (token.type === "intensity-range-end") {
      intensity = new RangeIntensityEnd(token.value);
      tokens.shift();
    } else {
      break;
    }
  }

  if (!duration) {
    throw new ParseError("Duration not specified", loc);
  }
  if (!intensity) {
    intensity = new FreeIntensity();
  }

  const [comments, rest] = parseIntervalComments(tokens, duration);

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

  return {
    name: header.name || "Untitled",
    author: header.author || "",
    description: header.description || "",
    tags: header.tags || [],
    intervals: parseIntervals(intervalTokens),
  };
};
