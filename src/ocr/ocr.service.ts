// src/ocr/ocr.service.ts
import { createUserContent, GoogleGenAI, Type } from '@google/genai';
import {
  Injectable,
  BadRequestException,
  GatewayTimeoutException,
  InternalServerErrorException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  private async safeGenerate(parts: any[]) {
    try {
      const resp = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: createUserContent(parts),
        config: { responseMimeType: 'application/json' },
      });
      if (!resp.text) {
        this.logger.error('Gemini devolvió respuesta vacía');
        throw new ServiceUnavailableException('Gemini no devolvió datos');
      }
      return JSON.parse(resp.text);
    } catch (err: any) {
      this.logger.error('Error desde Gemini', err);
      if (err.message?.includes('deadline exceeded')) {
        throw new GatewayTimeoutException('Timeout al contactar a Gemini');
      }
      if (err.code === 429 || err?.response?.status === 429) {
        throw new ServiceUnavailableException(
          'Límite de tasa de Gemini alcanzado',
        );
      }
      throw new InternalServerErrorException('Fallo interno al usar Gemini');
    }
  }

  async process(files: {
    front?: Express.Multer.File[];
    back?: Express.Multer.File[];
    selfie?: Express.Multer.File[];
  }) {
 
    const front = files.front?.[0],
      back = files.back?.[0],
      self = files.selfie?.[0];
    if (!front || !back || !self) {
      throw new BadRequestException('Faltan imágenes: front, back y/o selfie');
    }


    const prompt = `Eres un verificador de carnets bolivianos.

Tienes 3 IMÁGENES:
  ① — debería ser ANVERSO (foto + datos)
  ② — debería ser REVERSO (sin foto, con texto adicional)
  ③ — SELFIE reciente del titular

Cómo reconocer cada versión:
1) Laminado verde (pre-2019)
   • Anverso → huella grande y título “CÉDULA DE IDENTIDAD”
   • Reverso → encabezado “EL SERVICIO GENERAL DE IDENTIFICACIÓN PERSONAL CERTIFICA …”

2) Policarbonato blanco (2019+)
   • Anverso → fondo ondulado, bandera 🇧🇴, sin MRZ
   • Reverso → QR grande + MRZ “I<BOL…”

Si el orden NO cumple las reglas, responde exactamente:
{"error":"front/back order"}

Si el orden SÍ es correcto, responde SOLO este JSON:
{
 "numeroDoc":"…",
 "fullName":"…",
 "fechaNacimiento":"yyyy-MM-dd",
 "fechaExpedicion":"yyyy-MM-dd",
 "lugarExpedicion":"…",
 "faceMatch":true|false
}

No añadas ningún otro campo ni comentarios.`;

    const parts = [
      prompt,
      {
        inlineData: {
          mimeType: front.mimetype,
          data: front.buffer.toString('base64'),
        },
      },
      {
        inlineData: {
          mimeType: back.mimetype,
          data: back.buffer.toString('base64'),
        },
      },
      {
        inlineData: {
          mimeType: self.mimetype,
          data: self.buffer.toString('base64'),
        },
      },
    ];

    const data = await this.safeGenerate(parts);

    if (data.error === 'front/back order') {
      throw new BadRequestException(
        'Las imágenes están desordenadas (front/back).',
      );
    }

  
    const required = [
      'numeroDoc',
      'fullName',
      'fechaNacimiento',
      'fechaExpedicion',
      'lugarExpedicion',
      'faceMatch',
    ];
    const missing = required.filter((k) => data[k] == null);
    if (missing.length) {
      throw new BadRequestException(`Campos faltantes: ${missing.join(', ')}`);
    }

    // Fechas coherentes
    const born = new Date(data.fechaNacimiento);
    const exp = new Date(data.fechaExpedicion);
    if (isNaN(born.getTime()) || isNaN(exp.getTime()) || exp <= born) {
      throw new BadRequestException(
        'Fechas inconsistentes; revisa que las imágenes estén en el orden correcto.',
      );
    }

    // 6️⃣ faceMatch debe ser true
    if (data.faceMatch !== true) {
      throw new BadRequestException(
        'La verificación facial (faceMatch) ha fallado.',
      );
    }

    return data;
  }
}
