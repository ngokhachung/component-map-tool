import { Project, SourceFile, ArrayLiteralExpression, Node, SyntaxKind } from 'ts-morph';

function flatten(arr: ArrayLiteralExpression, sf: SourceFile): string[] {
  const out: string[] = [];
  for (const el of arr.getElements()) {
    if (Node.isSpreadElement(el)) {
      const expr = el.getExpression();
      if (Node.isIdentifier(expr)) {
        const init = sf.getVariableDeclaration(expr.getText())?.getInitializer();
        if (init && Node.isArrayLiteralExpression(init)) out.push(...flatten(init, sf));
      }
    } else if (Node.isIdentifier(el)) {
      out.push(el.getText());
    }
  }
  return out;
}

export function buildModuleMap(project: Project): Map<string, string> {
  const map = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      const arg = cls.getDecorator('NgModule')?.getArguments()[0];
      if (!arg || !Node.isObjectLiteralExpression(arg)) continue;
      const decls = arg.getProperty('declarations')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
      if (!decls || !Node.isArrayLiteralExpression(decls)) continue;
      const moduleName = cls.getName() ?? '<anon>';
      for (const name of flatten(decls, sf)) map.set(name, moduleName);
    }
  }
  return map;
}
