import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Current password, required to confirm the deletion.',
  })
  @IsString()
  @MinLength(1)
  password: string;
}
