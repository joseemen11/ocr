
import 'dotenv/config'; 
import { NestFactory } from '@nestjs/core';
import { AppModule }   from './app.module';

async function bootstrap() {
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY);  
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
