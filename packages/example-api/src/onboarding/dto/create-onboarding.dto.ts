import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsISO8601, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Request body for `POST /onboarding`. */
export class CreateOnboardingDto {
  @ApiProperty({
    type: String,
    example: 'ada@example.com',
    description: 'Applicant email address.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String, example: 'Ada Lovelace', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({
    type: String,
    example: '1990-05-17',
    description: 'ISO-8601 date, e.g. "1990-05-17".',
  })
  @IsISO8601({ strict: true })
  dateOfBirth!: string;
}
