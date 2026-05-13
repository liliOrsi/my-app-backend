import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const USER_ROLES = ['USER','ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 255})
  firstName!: string;

  @Column('varchar', { length: 255})
  lastName!: string;

  @Column('varchar', { length: 255, unique: true })
  @Index({ unique: true })
  email!: string;

  @Column('varchar', { length: 255, select: false })
  password?: string;

  @Column('enum', { enum: USER_ROLES, default: USER_ROLES[0] })
  role!: UserRole;

  @DeleteDateColumn()
  deletedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
