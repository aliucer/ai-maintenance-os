import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignTicketDto {
    @IsNotEmpty()
    @IsString()
    tenantId: string;

    @IsNotEmpty()
    @IsString()
    vendorName: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    assignedByUserId?: string;
}
