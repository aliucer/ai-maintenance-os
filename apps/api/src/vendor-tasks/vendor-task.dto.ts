import { IsString, IsOptional } from 'class-validator';

export class CompleteTaskDto {
    @IsString()
    tenantId: string;

    @IsString()
    @IsOptional()
    resolutionNotes?: string;
}
