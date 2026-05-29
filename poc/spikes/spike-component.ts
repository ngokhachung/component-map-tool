import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  Project, ClassDeclaration, ObjectLiteralExpression, SyntaxKind, Node,
} from 'ts-morph';
import type { ComponentRecord, IoPort, TaskReport } from '../types.js';
import { scoreCase, scoreTask } from '../harness/report.js';
import { loadFixtures } from './lib/load-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'component');

function getComponentDecoratorArg(cls: ClassDeclaration): ObjectLiteralExpression | null {
  const dec = cls.getDecorator('Component');
  const arg = dec?.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : null;
}

function readStringProp(obj: ObjectLiteralExpression, name: string): string | null {
  const p = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
  const init = p?.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralValue() : null;
}

function readBoolProp(obj: ObjectLiteralExpression, name: string): boolean | null {
  const p = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
  const init = p?.getInitializer();
  if (!init) return null;
  if (init.getKind() === SyntaxKind.TrueKeyword) return true;
  if (init.getKind() === SyntaxKind.FalseKeyword) return false;
  return null;
}

function classifyIo(prop: Node): { dir: 'in' | 'out' | 'both' | null; port: Omit<IoPort, 'name'> | null; name: string } | null {
  if (!Node.isPropertyDeclaration(prop)) return null;
  const name = prop.getName();
  const inDec = prop.getDecorator('Input');
  const outDec = prop.getDecorator('Output');
  if (inDec || outDec) {
    const alias = (inDec ?? outDec)?.getArguments()[0];
    const aliasVal = alias && Node.isStringLiteral(alias) ? alias.getLiteralValue() : null;
    return { dir: inDec ? 'in' : 'out', name, port: { alias: aliasVal, kind: 'decorator', required: false } };
  }
  const init = prop.getInitializer();
  if (init && Node.isCallExpression(init)) {
    const callee = init.getExpression().getText();
    const aliasArgObj = init.getArguments().find(Node.isObjectLiteralExpression);
    const aliasVal = aliasArgObj ? readStringProp(aliasArgObj, 'alias') : null;
    if (callee === 'input' || callee === 'input.required')
      return { dir: 'in', name, port: { alias: aliasVal, kind: 'signal', required: callee.endsWith('required') } };
    if (callee === 'output')
      return { dir: 'out', name, port: { alias: aliasVal, kind: 'signal', required: false } };
    if (callee === 'model' || callee === 'model.required')
      return { dir: 'both', name, port: { alias: aliasVal, kind: 'signal', required: callee.endsWith('required') } };
  }
  return null;
}

function buildModuleMap(project: Project): Map<string, string> {
  const map = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      const modDec = cls.getDecorator('NgModule');
      const arg = modDec?.getArguments()[0];
      if (arg && Node.isObjectLiteralExpression(arg)) {
        const decls = arg.getProperty('declarations')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
        if (decls && Node.isArrayLiteralExpression(decls)) {
          for (const el of decls.getElements()) map.set(el.getText(), cls.getName() ?? '<anon>');
        }
      }
    }
  }
  return map;
}

export function extractComponent(cls: ClassDeclaration, moduleMap: Map<string, string>): ComponentRecord | null {
  const obj = getComponentDecoratorArg(cls);
  if (!obj) return null;
  const className = cls.getName() ?? '<anon>';
  const standaloneExplicit = readBoolProp(obj, 'standalone');
  const inputs: IoPort[] = [];
  const outputs: IoPort[] = [];
  for (const prop of cls.getProperties()) {
    const io = classifyIo(prop);
    if (!io || !io.port) continue;
    if (io.dir === 'in' || io.dir === 'both') inputs.push({ name: io.name, ...io.port });
    if (io.dir === 'out' || io.dir === 'both') outputs.push({ name: io.name, ...io.port });
  }
  return {
    className,
    selector: readStringProp(obj, 'selector'),
    standalone: standaloneExplicit === null ? true : standaloneExplicit,
    templateKind: obj.getProperty('template') ? 'inline' : obj.getProperty('templateUrl') ? 'templateUrl' : 'none',
    inputs,
    outputs,
    module: moduleMap.get(className) ?? null,
  };
}

function main(): TaskReport {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, strict: false },
  });
  project.addSourceFilesAtPaths(join(FIXTURES, '*.component.ts'));
  const moduleMap = buildModuleMap(project);

  const fixtures = loadFixtures<ComponentRecord>(FIXTURES, '.component.ts');
  let standalonePassed = 0;
  let ngModulePassed = 0;
  const cases = fixtures.map((fx) => {
    const sf = project.getSourceFileOrThrow(fx.sourcePath);
    const cls = sf.getClasses().find((c) => c.getDecorator('Component'));
    const actual = cls ? extractComponent(cls, moduleMap) : null;
    writeFileSync(`${fx.sourcePath}.actual.json`, JSON.stringify(actual, null, 2));
    const result = scoreCase(fx.name, actual, fx.expected);
    if (result.pass) (fx.expected.standalone ? standalonePassed++ : ngModulePassed++);
    return result;
  });

  const report = scoreTask('component', cases);
  report.meta = { standalonePassed, ngModulePassed };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('spike-component.ts')) main();
export { main as runComponentSpike };
