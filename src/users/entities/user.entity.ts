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

export const USER_STATUSES = ['PENDING', 'ACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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

  @Column('varchar', { length: 255, select: false, nullable: true })
  password?: string;

  @Column('enum', { enum: USER_ROLES, default: USER_ROLES[0] })
  role!: UserRole;

  @Column('enum', { enum: USER_STATUSES, default: 'ACTIVE' })
  status!: UserStatus;

  @DeleteDateColumn()
  deletedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
