import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsEnumValue(
  enumType: any,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isEnumValue',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [enumType],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          return Object.values(enumType).includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be one of: ${Object.values(args.constraints[0]).join(', ')}`;
        },
      },
    });
  };
}
