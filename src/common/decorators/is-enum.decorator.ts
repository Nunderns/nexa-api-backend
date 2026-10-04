import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsEnumValue(
  enumType: Record<string, unknown>,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEnumValue',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [enumType],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return Object.values(enumType).includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          const allowed = Object.values(
            args.constraints[0] as Record<string, unknown>,
          );

          return `${args.property} must be one of: ${allowed.join(', ')}`;
        },
      },
    });
  };
}
