export interface FileNameParts {
  stem: string;
  extension: string;
}

export function splitFileName(name: string): FileNameParts {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension: name.slice(dot) };
}
