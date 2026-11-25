import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Request body for `POST /refund-requests/:runId/human-approval`. */
export class HumanApprovalDto {
  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiProperty({ type: String, example: 'support-lead-bot', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  reviewer!: string;

  @ApiPropertyOptional({ type: String, example: 'Verified against order history', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
