export type AssetValidationPathSegment = string | number;

export type AssetValidationIssue = Readonly<{
  path: readonly AssetValidationPathSegment[];
  code: string;
  message: string;
}>;

function formatPath(path: readonly AssetValidationPathSegment[]): string {
  if (path.length === 0) return '$';
  return path.reduce<string>((result, segment) => (
    typeof segment === 'number'
      ? `${result}[${segment}]`
      : `${result}.${segment}`
  ), '$');
}

export class AssetValidationError extends TypeError {
  public override readonly name = 'AssetValidationError';
  public readonly issues: readonly AssetValidationIssue[];

  public constructor(issues: readonly AssetValidationIssue[]) {
    const frozenIssues = Object.freeze(issues.map((issue) => Object.freeze({
      path: Object.freeze([...issue.path]),
      code: issue.code,
      message: issue.message,
    })));
    const first = frozenIssues[0];
    super(first === undefined
      ? 'Asset validation failed'
      : `Asset validation failed at ${formatPath(first.path)}: ${first.message}`);
    this.issues = frozenIssues;
  }
}
