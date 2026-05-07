import { Injectable, Logger } from '@nestjs/common';

interface DolarApiResponse {
  compra: number;
  venta: number;
  nombre: string;
  moneda: string;
  fechaActualizacion: string;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  async getUsdToArsOfficialRate(): Promise<number> {
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
    if (!response.ok) {
      throw new Error(`dolarapi.com returned ${response.status}`);
    }
    const data = (await response.json()) as DolarApiResponse;
    this.logger.log(`Fetched official USD rate: venta=${data.venta} (${data.fechaActualizacion})`);
    return data.venta;
  }
}
