import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Expense } from '../expenses/expense.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  icon!: string;

  @Column({ nullable: true })
  color!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => Expense, (expense) => expense.category)
  expenses!: Expense[];
}

