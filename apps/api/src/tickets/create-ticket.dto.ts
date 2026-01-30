import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateTicketDto {
    @IsString()
    tenantId: string;

    @IsString()
    @IsOptional()
    unitId?: string;

    @IsString()
    title: string;

    @IsString()
    description: string;

    @IsString()
    message: string;

    @IsInt()
    @Min(0)
    @Max(5)
    @IsOptional()
    priority?: number;

    @IsString()
    @IsOptional()
    correlationId?: string;

    @IsString()
    @IsOptional()
    id?: string;
}
