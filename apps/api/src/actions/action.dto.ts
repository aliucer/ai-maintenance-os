import { IsString, IsOptional } from 'class-validator';

export class ApproveActionDto {
    @IsString()
    tenantId: string;

    @IsString()
    decidedByUserId: string;
}

export class RejectActionDto {
    @IsString()
    tenantId: string;

    @IsString()
    decidedByUserId: string;

    @IsString()
    @IsOptional()
    rejectionReason?: string;
}
