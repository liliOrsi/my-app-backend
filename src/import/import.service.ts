import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Expense } from '../expenses/expense.entity';
import { Income, IncomeSource } from '../incomes/income.entity';
import { Category } from '../categories/category.entity';
import { IncomesService } from '../incomes/incomes.service';
import { BalanceService } from '../balance/balance.service';

export type ImportStatus = 'new' | 'duplicate' | 'possible_duplicate';

export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  kind: 'expense' | 'income';
  externalId?: string;
  balance?: number;
  categoryId?: number;
  type?: string;
  source?: string;
}

export interface PreviewItem {
  status: ImportStatus;
  data: ParsedRow;
  existingId?: number;
  existingDescription?: string;
}

export interface ImportPreview {
  expenses: PreviewItem[];
  incomes: PreviewItem[];
  balanceAmount?: number;
  balanceDate?: string;
}

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(Income)
    private readonly incomeRepo: Repository<Income>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly incomesService: IncomesService,
    private readonly balanceService: BalanceService,
  ) {}

  parseExcel(buffer: Buffer): ParsedRow[] {
    // Detect CSV (no-header format: date,description,debit,credit,...)
    const text = buffer.toString('utf8', 0, 200).trim();
    if (text.startsWith('0') || /^\d{2}\/\d{2}\/\d{2}/.test(text)) {
      return this.parseCsvNoHeader(buffer);
    }

    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

    // Handles Spanish format: "300.000,00" → 300000.00, "-44.314,79" → -44314.79
    // Also handles plain JS numbers (xlsx may already parse numeric cells)
    const parseNum = (val: unknown): number => {
      if (typeof val === 'number') return val;
      const s = String(val ?? '').trim().replace(/[^0-9.,-]/g, '');
      if (!s) return NaN;
      // If comma present → Spanish format: periods are thousands separators
      if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
      return parseFloat(s);
    };

    // Find header row — first row that has at least 3 non-null values
    let headerIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const nonNull = raw[i].filter(v => !isEmpty(v)).length;
      if (nonNull >= 3) {
        headerIdx = i;
        headers = raw[i].map(h => String(h ?? '').toLowerCase().trim());
        break;
      }
    }

    if (headerIdx === -1) return [];

    // Map column names flexibly
    const col = (keywords: string[]) =>
      headers.findIndex(h => keywords.some(k => h.includes(k)));

    const dateCol   = col(['fecha', 'date', 'fec']);
    const descCol   = col(['descripci', 'concepto', 'detalle', 'description', 'desc']);
    const debitCol  = col(['débito', 'debito', 'debit', 'egreso', 'cargo']);
    const creditCol = col(['crédito', 'credito', 'credit', 'ingreso', 'abono', 'haber']);
    const amtCol    = col(['monto', 'importe', 'amount', 'valor']);
    const balCol    = col(['saldo', 'balance']);
    const idCol     = col(['referencia', 'operaci', 'id', 'nro', 'comprobante', 'numero']);

    const rows: ParsedRow[] = [];

    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.every(v => isEmpty(v))) continue;

      // Parse date
      const rawDate: unknown = row[dateCol];
      let date: string | null = null;
      if (rawDate instanceof Date) {
        date = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === 'string' && rawDate.trim()) {
        const parts = rawDate.trim().split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      } else if (typeof rawDate === 'number') {
        const d = XLSX.SSF.parse_date_code(rawDate);
        date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
      if (!date) continue;

      const description = String(row[descCol] ?? '').trim();
      if (!description) continue;

      let amount: number | null = null;
      let kind: 'expense' | 'income' = 'expense';

      if (debitCol !== -1 && creditCol !== -1) {
        const debit  = parseNum(row[debitCol]);
        const credit = parseNum(row[creditCol]);
        if (!isNaN(debit)  && debit  > 0) { amount = debit;  kind = 'expense'; }
        if (!isNaN(credit) && credit > 0) { amount = credit; kind = 'income';  }
      } else if (amtCol !== -1) {
        const parsed = parseNum(row[amtCol]);
        if (!isNaN(parsed) && parsed !== 0) {
          amount = Math.abs(parsed);
          kind   = parsed < 0 ? 'expense' : 'income';
        }
      }

      if (amount === null || amount <= 0) continue;

      const balance = balCol !== -1
        ? parseNum(row[balCol]) || undefined
        : undefined;

      const externalId = idCol !== -1 ? String(row[idCol] ?? '').trim() || undefined : undefined;

      rows.push({ date, description, amount, kind, externalId, balance });
    }

    return rows;
  }

  private parseCsvNoHeader(buffer: Buffer): ParsedRow[] {
    const lines = buffer.toString('utf8').split('\n').map(l => l.trim()).filter(Boolean);
    const rows: ParsedRow[] = [];

    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length < 3) continue;

      // col 0: date MM/DD/YY or DD/MM/YY
      const rawDate = cols[0].trim();
      const parts = rawDate.split('/');
      if (parts.length !== 3) continue;
      let date: string;
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      // MM/DD/YY → YYYY-MM-DD
      date = `${y}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;

      const description = cols[1].trim();
      if (!description) continue;

      const debit  = parseFloat(cols[2].trim());
      const credit = cols[3] ? parseFloat(cols[3].trim()) : NaN;

      let amount: number;
      let kind: 'expense' | 'income';

      if (!isNaN(credit) && credit > 0) {
        amount = credit;
        kind = 'income';
      } else if (!isNaN(debit) && debit > 0) {
        amount = debit;
        kind = 'expense';
      } else {
        continue;
      }

      rows.push({ date, description, amount, kind });
    }

    return rows;
  }

  async buildPreview(rows: ParsedRow[]): Promise<ImportPreview> {
    const withBalance = rows.filter(r => r.balance !== undefined && !isNaN(r.balance!));
    let balanceAmount: number | undefined;
    let balanceDate: string | undefined;
    if (withBalance.length > 0) {
      const mostRecent = withBalance.reduce((a, b) => (a.date >= b.date ? a : b));
      balanceAmount = mostRecent.balance!;
      balanceDate   = mostRecent.date;
    }

    const preview: ImportPreview = { expenses: [], incomes: [], balanceAmount, balanceDate };

    for (const row of rows) {
      const item = await this.checkDuplicate(row);
      if (row.kind === 'expense') preview.expenses.push(item);
      else                        preview.incomes.push(item);
    }

    return preview;
  }

  private async checkDuplicate(row: ParsedRow): Promise<PreviewItem> {
    const repo = row.kind === 'expense' ? this.expenseRepo : this.incomeRepo;

    // 1. Exact match by externalId
    if (row.externalId) {
      const existing = await repo.findOne({ where: { externalId: row.externalId } as any });
      if (existing) {
        return { status: 'duplicate', data: row, existingId: existing.id, existingDescription: (existing as any).description };
      }
    }

    // 2. Possible duplicate: same date ±1 day + amount within 1%
    const d = new Date(row.date);
    const from = new Date(d); from.setDate(d.getDate() - 1);
    const to   = new Date(d); to.setDate(d.getDate() + 1);
    const fmt  = (dt: Date) => dt.toISOString().slice(0, 10);

    const candidates = await repo.createQueryBuilder('e')
      .where('e.date BETWEEN :from AND :to', { from: fmt(from), to: fmt(to) })
      .andWhere('ABS(CAST(e.amount AS DECIMAL) - :amt) / :amt < 0.01', { amt: row.amount })
      .getMany();

    if (candidates.length > 0) {
      const c = candidates[0] as any;
      return { status: 'possible_duplicate', data: row, existingId: c.id, existingDescription: c.description };
    }

    return { status: 'new', data: row };
  }

  async getBatches(): Promise<{ batchId: string | null; minDate: string; maxDate: string; snapshotAmount: number | null; expenseCount: number; incomeCount: number; totalExpenses: number; totalIncomes: number }[]> {
    // Get all bbva expenses grouped by batchId
    const expenses = await this.expenseRepo.find({ where: { importSource: 'bbva_import' } as any, order: { date: 'ASC' } });
    const incomes  = await this.incomeRepo.find({ where: { importSource: 'bbva_import' } as any, order: { date: 'ASC' } });

    // Group by batchId (null batchId = legacy records before this feature)
    const batchMap = new Map<string, { expenses: typeof expenses; incomes: typeof incomes }>();
    const legacyKey = '__legacy__';
    for (const e of expenses) {
      const key = (e as any).importBatchId ?? legacyKey;
      if (!batchMap.has(key)) batchMap.set(key, { expenses: [], incomes: [] });
      batchMap.get(key)!.expenses.push(e);
    }
    for (const i of incomes) {
      const key = (i as any).importBatchId ?? legacyKey;
      if (!batchMap.has(key)) batchMap.set(key, { expenses: [], incomes: [] });
      batchMap.get(key)!.incomes.push(i);
    }

    // Get snapshots keyed by batchId
    const snapshotRepo = this.balanceService['repo'];
    const snapshots: any[] = await snapshotRepo.find({ where: { source: 'bbva_import' } });
    const snapByBatch = new Map<string, number>();
    for (const s of snapshots) {
      if (s.importBatchId) snapByBatch.set(s.importBatchId, Number(s.amount));
    }

    const result: { batchId: string | null; minDate: string; maxDate: string; snapshotAmount: number | null; expenseCount: number; incomeCount: number; totalExpenses: number; totalIncomes: number }[] = [];
    for (const [key, { expenses: exps, incomes: incs }] of batchMap.entries()) {
      const allDates = [...exps.map(e => e.date), ...incs.map(i => i.date)].sort();
      result.push({
        batchId:        key === legacyKey ? null : key,
        minDate:        allDates[0] ?? '',
        maxDate:        allDates[allDates.length - 1] ?? '',
        snapshotAmount: key === legacyKey ? null : (snapByBatch.get(key) ?? null),
        expenseCount:   exps.length,
        incomeCount:    incs.length,
        totalExpenses:  exps.reduce((s, e) => s + Number(e.amount), 0),
        totalIncomes:   incs.reduce((s, i) => s + Number(i.amount), 0),
      });
    }

    // Sort by most recent maxDate first
    return result.sort((a, b) => b.maxDate.localeCompare(a.maxDate));
  }

  async deleteBatch(batchId: string): Promise<{ deletedExpenses: number; deletedIncomes: number }> {
    const isLegacy = batchId === 'legacy';
    const expenses = await this.expenseRepo.find({ where: { importSource: 'bbva_import' } as any });
    const incomes  = await this.incomeRepo.find({ where: { importSource: 'bbva_import' } as any });

    const targetExp = expenses.filter(e => isLegacy ? !(e as any).importBatchId : (e as any).importBatchId === batchId);
    const targetInc = incomes.filter(i => isLegacy ? !(i as any).importBatchId : (i as any).importBatchId === batchId);

    await Promise.all([
      ...targetExp.map(e => this.expenseRepo.remove(e)),
      ...targetInc.map(i => this.incomeRepo.remove(i)),
    ]);

    if (!isLegacy) {
      await this.balanceService.deleteByBatchId(batchId);
    }

    return { deletedExpenses: targetExp.length, deletedIncomes: targetInc.length };
  }

  async getBatchTransactions(batchId: string): Promise<{ expenses: any[]; incomes: any[] }> {
    const isLegacy = batchId === 'legacy';
    const allExp = await this.expenseRepo.find({ where: { importSource: 'bbva_import' } as any, order: { date: 'ASC' } });
    const allInc = await this.incomeRepo.find({ where: { importSource: 'bbva_import' } as any, order: { date: 'ASC' } });
    return {
      expenses: allExp.filter(e => isLegacy ? !(e as any).importBatchId : (e as any).importBatchId === batchId),
      incomes:  allInc.filter(i => isLegacy ? !(i as any).importBatchId : (i as any).importBatchId === batchId),
    };
  }

  async deleteAllBbvaImport(): Promise<{ deletedExpenses: number; deletedIncomes: number; deletedSnapshots: number }> {
    const expenses = await this.expenseRepo.find({ where: { importSource: 'bbva_import' } as any });
    const incomes  = await this.incomeRepo.find({ where: { importSource: 'bbva_import' } as any });
    await Promise.all([
      ...expenses.map(e => this.expenseRepo.remove(e)),
      ...incomes.map(i => this.incomeRepo.remove(i)),
    ]);
    const snapshotRepo = this.balanceService['repo'];
    const snapshots = await snapshotRepo.find({ where: { source: 'bbva_import' } });
    await Promise.all(snapshots.map((s: any) => snapshotRepo.remove(s)));
    return { deletedExpenses: expenses.length, deletedIncomes: incomes.length, deletedSnapshots: snapshots.length };
  }

  async confirmImport(
    expenses: ParsedRow[],
    incomes: ParsedRow[],
    defaultCategoryId: number,
    balanceAmount?: number,
    balanceDate?: string,
  ): Promise<{ createdExpenses: number; createdIncomes: number; batchId: string }> {
    const batchId = randomUUID();

    // Resolve categoryId — fall back to first available if provided ID doesn't exist
    let resolvedCategoryId = defaultCategoryId;
    const catExists = await this.categoryRepo.findOne({ where: { id: defaultCategoryId } });
    if (!catExists) {
      const firstCat = await this.categoryRepo.findOne({ where: {}, order: { id: 'ASC' } });
      if (!firstCat) throw new Error('No hay categorías disponibles. Creá una antes de importar.');
      resolvedCategoryId = firstCat.id;
    }

    if (balanceAmount !== undefined && balanceDate) {
      await this.balanceService.set(balanceAmount, balanceDate, 'bbva_import', 'banco', batchId);
    }
    let createdExpenses = 0;
    let createdIncomes  = 0;

    for (const row of expenses) {
      const expense = this.expenseRepo.create({
        description:    row.description,
        amount:         row.amount,
        date:           row.date,
        type:           'VARIABLE' as any,
        moneyType:      'ARS' as any,
        categoryId:     row.categoryId ?? resolvedCategoryId,
        externalId:     row.externalId ?? null,
        fromAccount:    'banco',
        importSource:   'bbva_import',
        importBatchId:  batchId,
      } as any);
      await this.expenseRepo.save(expense);
      createdExpenses++;
    }

    for (const row of incomes) {
      const source = row.source
        ? (IncomeSource[row.source as keyof typeof IncomeSource] ?? IncomeSource.TRANSFER)
        : IncomeSource.TRANSFER;
      const income = this.incomeRepo.create({
        description:    row.description,
        amount:         row.amount,
        date:           row.date,
        moneyType:      'ARS' as any,
        source,
        externalId:     row.externalId ?? null,
        fromAccount:    'banco',
        importSource:   'bbva_import',
        importBatchId:  batchId,
      } as any);
      await this.incomeRepo.save(income);
      createdIncomes++;
    }

    return { createdExpenses, createdIncomes, batchId };
  }
}
