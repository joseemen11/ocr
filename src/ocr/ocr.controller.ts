import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'front',  maxCount: 1 },
      { name: 'back',   maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  async runOcr(
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      back?:  Express.Multer.File[];
      selfie?:Express.Multer.File[];
    },
  ) {
    if (!files.front?.[0] || !files.back?.[0] || !files.selfie?.[0]) {
      throw new BadRequestException(
        'Debe enviar front, back y selfie en la misma petición',
      );
    }

    return this.ocrService.process(files);
  }
}
