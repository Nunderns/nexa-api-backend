import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/**
 * Helpers to read the routing metadata NestJS registers on controllers, so specs
 * can assert that every endpoint is exposed on the path/method it should be.
 */
type ControllerClass = abstract new (...args: never[]) => object;

/** Strips the leading/trailing slashes NestJS keeps on the metadata values. */
const trimSlashes = (path: string): string => path.replace(/^\/+|\/+$/g, '');

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

/** Returns the route of a single handler, e.g. `GET /users/:id/posts`. */
export function routeOf(
  controller: ControllerClass,
  methodName: string,
): string | null {
  return buildRoute(controller, methodName);
}

/** Returns every route of a controller as sorted `METHOD /path` strings. */
export function collectRoutes(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => buildRoute(controller, name))
    .filter((route): route is string => route !== null)
    .sort();
}
