import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailDto {
  @ApiProperty({ example: 'a1b2c3d4e5f6...' })
  @IsString()
  @MinLength(1)
  token: string;
}
