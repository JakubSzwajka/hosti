export function groupComments(sourceCode) {
  const comments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === "Line" || comment.type === "Block");
  const groups = [];

  for (const comment of comments) {
    const previousGroup = groups.at(-1);
    const previous = previousGroup?.at(-1);
    const separator = previous ? sourceCode.text.slice(previous.range[1], comment.range[0]) : "";
    const continuesLineGroup =
      comment.type === "Line" &&
      previous?.type === "Line" &&
      comment.loc.start.line === previous.loc.end.line + 1 &&
      /^(?:\r\n|[\n\r\u2028\u2029])[\t ]*$/u.test(separator);

    if (continuesLineGroup) previousGroup.push(comment);
    else groups.push([comment]);
  }

  return groups;
}

export function contains(outerRange, innerRange) {
  return outerRange[0] <= innerRange[0] && innerRange[1] <= outerRange[1];
}

export function intersects(firstRange, secondRange) {
  return firstRange[0] < secondRange[1] && secondRange[0] < firstRange[1];
}

export function decoratedArea(node) {
  if (!node.decorators?.length) return null;

  const firstDecorator = node.decorators[0];
  const contentStart = node.key?.range?.[0] ?? node.id?.range?.[0] ?? node.range[1];
  return [firstDecorator.range[0], contentStart];
}
