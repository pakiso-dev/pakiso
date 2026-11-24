import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Request body for `POST /onboarding/:runId/compliance-approval`. */
export class ComplianceApprovalDto {
  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiProperty({ type: String, example: 'compliance-bot', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  reviewer!: string;

  @ApiPropertyOptional({ type: String, example: 'Mismatched documents', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
