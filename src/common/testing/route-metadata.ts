import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

type ControllerClass = abstract new (...args: never[]) => object;

const trimSlashes = (path: string): string => {
  let start = 0;
  let end = path.length;

  while (start < end && path[start] === '/') {
    start++;
  }

  while (end > start && path[end - 1] === '/') {
    end--;
  }

  return path.slice(start, end);
};

const buildRoute = (
  controller: ControllerClass,
  methodName: string,
): string | null => {
  const handler = (controller.prototype as Record<string, unknown>)[methodName];

  if (typeof handler !== 'function') {
    return null;
  }

  const method = Reflect.getMetadata(METHOD_METADATA, handler) as
    RequestMethod | undefined;

  if (method === undefined) {
    return null;
  }

  const controllerPath =
    (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ??
    '';
  const handlerPath =
    (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';

  const fullPath = [controllerPath, handlerPath]
    .map(trimSlashes)
    .filter(Boolean)
    .join('/');

  return `${RequestMethod[method]} /${fullPath}`;
};

export function routeOf(
  controller: ControllerClass,
  methodName: string,
): string | null {
  return buildRoute(controller, methodName);
}

export const compareRoutes = (a: string, b: string): number =>
  a.localeCompare(b, 'en');

export function collectRoutes(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => buildRoute(controller, name))
    .filter((route): route is string => route !== null)
    .sort(compareRoutes);
}
