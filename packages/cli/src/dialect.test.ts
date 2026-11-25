import { describe, expect, it } from 'vitest';
import {
  detectDialect,
  generatedClientPathFor,
  schemaPathFor,
  storagePrismaDir,
  triggerSqlPathFor,
} from './dialect.js';

describe('detectDialect', () => {
  it.each([
    ['postgresql://user:pass@host:5432/db', 'postgresql'],
    ['postgres://user:pass@host:5432/db', 'postgresql'],
    ['mysql://user:pass@host:3306/db', 'mysql'],
    ['file:./dev.db', 'sqlite'],
    ['sqlite:./dev.db', 'sqlite'],
  ] as const)('detects %s as %s', (url, expected) => {
    expect(detectDialect(url)).toBe(expected);
  });

  it('throws for an unrecognized connection string', () => {
    expect(() => detectDialect('mongodb://host/db')).toThrow(
      'Cannot detect a Pakiso dialect from PAKISO_DATABASE_URL "mongodb://host/db"',
    );
  });
});

describe('path resolution helpers', () => {
  it('resolves the installed @pakiso/storage-prisma package directory', () => {
    expect(storagePrismaDir()).toMatch(/storage-prisma$/);
  });

  it('resolves schema, generated client, and trigger paths per dialect', () => {
    expect(schemaPathFor('postgresql')).toMatch(/prisma\/postgresql\.prisma$/);
    expect(schemaPathFor('sqlite')).toMatch(/prisma\/sqlite\.prisma$/);
    expect(generatedClientPathFor('mysql')).toMatch(/generated\/mysql\/index\.js$/);
    expect(triggerSqlPathFor('postgresql')).toMatch(/postgresql-prevent-event-mutation\.sql$/);
    expect(triggerSqlPathFor('mysql')).toBeNull();
    expect(triggerSqlPathFor('sqlite')).toBeNull();
  });
});
