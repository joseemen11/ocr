// src/ocr/ocr.service.ts
import {
  
  createUserContent,
  GoogleGenAI,
  Type,
} from '@google/genai';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

@Injectable()
export class OcrService {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async process(files: {
    front?:  Express.Multer.File[];
    back?:   Express.Multer.File[];
    selfie?: Express.Multer.File[];
  }) {
    const front = files.front?.[0];
    const back  = files.back?.[0];
    const self  = files.selfie?.[0];
    if (!front || !back || !self) {
      throw new InternalServerErrorException('Faltan front, back o selfie');
    }

    const parts = createUserContent([
      `Eres un asistente de verificación de identidad.
       1) Extrae: numeroDoc, fullName, fechaNacimiento (yyyy-mm-dd),
          fechaExpedicion, lugarExpedicion, sexo.
       2) Compara la foto del anverso con la selfie
          y responde "faceMatch": true|false.
       Devuelve SÓLO JSON válido.`,

      // inline front
      {
        inlineData: {
          mimeType: front.mimetype,
          data:     front.buffer.toString('base64'),
        },
      },
      // inline back
      {
        inlineData: {
          mimeType: back.mimetype,
          data:     back.buffer.toString('base64'),
        },
      },
      // inline selfie
      {
        inlineData: {
          mimeType: self.mimetype,
          data:     self.buffer.toString('base64'),
        },
      },
    ]);

    const resp = await this.ai.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            numeroDoc:       { type: Type.STRING },
            fullName:        { type: Type.STRING },
            fechaNacimiento: { type: Type.STRING },
            fechaExpedicion: { type: Type.STRING },
            lugarExpedicion: { type: Type.STRING },
            faceMatch:       { type: Type.BOOLEAN },
          },
          propertyOrdering: [
            'numeroDoc','fullName','fechaNacimiento',
            'fechaExpedicion','lugarExpedicion','faceMatch'
          ],
        },
      },
    });

    const txt = resp.text;
    if (!txt) throw new Error('Gemini no devolvió texto');
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error('JSON inválido: ' + txt);
    }
  }
}
