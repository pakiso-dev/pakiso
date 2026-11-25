import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

/** Request body for `POST /refund-requests`. */
export class CreateRefundRequestDto {
  @ApiProperty({ type: String, example: 'TCK-1001', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ticketId!: string;

  @ApiProperty({ type: String, example: 'ada@example.com' })
  @IsEmail()
  customerEmail!: string;

  @ApiProperty({
    type: Number,
    example: 2500,
    description: 'Refund amount in cents. Amounts >= 10000 ($100) require human sign-off.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000_00)
  refundAmountCents!: number;

  @ApiProperty({
    type: String,
    example: 'Item arrived damaged',
    maxLength: 500,
    description: 'Freeform customer-provided reason the support agent evaluates.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
