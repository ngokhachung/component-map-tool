import { ClassDeclaration, ObjectLiteralExpression, SyntaxKind, Node } from 'ts-morph';
import type { IoPort } from '../types.js';

export interface ComponentMeta {
  className: string;
  selector: string | null;
  filePath: string;
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
  standaloneExplicit: boolean | null;
}

function decoratorArg(cls: ClassDeclaration): ObjectLiteralExpression | null {
  const arg = cls.getDecorator('Component')?.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : null;
}

function stringProp(obj: ObjectLiteralExpression, name: string): string | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralValue() : null;
}

function boolProp(obj: ObjectLiteralExpression, name: string): boolean | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (!init) return null;
  if (init.getKind() === SyntaxKind.TrueKeyword) return true;
  if (init.getKind() === SyntaxKind.FalseKeyword) return false;
  return null;
}

function classifyIo(prop: Node): { dir: 'in' | 'out' | 'both' | null; port: Omit<IoPort, 'name'>; name: string } | null {
  if (!Node.isPropertyDeclaration(prop)) return null;
  const name = prop.getName();
  const inDec = prop.getDecorator('Input');
  const outDec = prop.getDecorator('Output');
  if (inDec || outDec) {
    const aliasArg = (inDec ?? outDec)?.getArguments()[0];
    const alias = aliasArg && Node.isStringLiteral(aliasArg) ? aliasArg.getLiteralValue() : null;
    return { dir: inDec ? 'in' : 'out', name, port: { alias, kind: 'decorator', required: false } };
  }
  const init = prop.getInitializer();
  if (init && Node.isCallExpression(init)) {
    const callee = init.getExpression().getText();
    const optsObj = init.getArguments().find(Node.isObjectLiteralExpression);
    const alias = optsObj ? stringProp(optsObj, 'alias') : null;
    if (callee === 'input' || callee === 'input.required')
      return { dir: 'in', name, port: { alias, kind: 'signal', required: callee.endsWith('required') } };
    if (callee === 'output')
      return { dir: 'out', name, port: { alias, kind: 'signal', required: false } };
    if (callee === 'model' || callee === 'model.required')
      return { dir: 'both', name, port: { alias, kind: 'signal', required: callee.endsWith('required') } };
  }
  return null;
}

export function extractComponentMeta(cls: ClassDeclaration, filePath: string): ComponentMeta | null {
  const obj = decoratorArg(cls);
  if (!obj) return null;
  const inputs: IoPort[] = [];
  const outputs: IoPort[] = [];
  for (const prop of cls.getProperties()) {
    const io = classifyIo(prop);
    if (!io) continue;
    if (io.dir === 'in' || io.dir === 'both') inputs.push({ name: io.name, ...io.port });
    if (io.dir === 'out' || io.dir === 'both') outputs.push({ name: io.name, ...io.port });
  }
  return {
    className: cls.getName() ?? '<anon>',
    selector: stringProp(obj, 'selector'),
    filePath,
    templateKind: obj.getProperty('template') ? 'inline' : obj.getProperty('templateUrl') ? 'templateUrl' : 'none',
    inputs,
    outputs,
    standaloneExplicit: boolProp(obj, 'standalone'),
  };
}
