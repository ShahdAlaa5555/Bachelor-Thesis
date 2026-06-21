/**
 * seed-attendance-feb-aug-2026.js
 * ─────────────────────────────────────────────────────────────────────────
 * Seeds AttendanceRecord rows for ALL active employees across
 * February 2026 and August 2026, with a few random Absent days
 * per employee per month, for exhibition/demo purposes.
 *
 * Behavior:
 *  - Skips weekends (Friday=5, Saturday=6 — Egypt convention, matches
 *    the dow checks already used in your service layer)
 *  - Skips dates already present in HolidayCalendar (global or matching
 *    the employee's WorkLocationID)
 *  - Skips any date where an AttendanceRecord already exists for that
 *    employee (never overwrites existing data)
 *  - Looks up each employee's active EmployeeShiftAssignment to get
 *    real CheckIn/CheckOut window + lateness; falls back to a default
 *    9:00–17:00 / 8h shift if the employee has no assignment
 *  - Randomly picks 2–4 working days per employee per month and marks
 *    them Absent instead (no CheckIn/CheckOut, WorkedHours = 0)
 *  - IsManualEntry = true on every row, with a Notes tag so you can
 *    identify/delete seeded rows later if needed
 *
 * USAGE:
 *   node seed-attendance-feb-aug-2026.js
 *
 * REQUIRES:
 *   - DATABASE_URL env var set (same as your backend .env)
 *   - @prisma/client + dayjs already installed in this project
 *     (run from inside hrms-backend, or point PRISMA_SCHEMA_PATH)
 * ─────────────────────────────────────────────────────────────────────────
 */

const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');

const prisma = new PrismaClient();

const SEED_TAG = '[SEEDED-DEMO-2026]';
const YEAR = 2026;
const MONTHS = [2, 8]; // February, August
const ABSENCES_PER_MONTH_MIN = 2;
const ABSENCES_PER_MONTH_MAX = 4;

const DEFAULT_SHIFT = {
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
  breakMinutes: 60,
  expectedHours: 8,
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isWeekend(date) {
  const dow = date.day(); // 0=Sun ... 5=Fri, 6=Sat
  return dow === 5 || dow === 6;
}

function pickRandomLateness() {
  // Most days on-time; occasionally a few minutes late (realistic spread)
  const roll = Math.random();
  if (roll < 0.7) return 0;
  if (roll < 0.9) return randInt(1, 14);
  return randInt(15, 35);
}

function pickRandomOvertimeHours(expectedHours) {
  // Occasionally a bit of overtime
  if (Math.random() < 0.15) return parseFloat((Math.random() * 1.5).toFixed(2));
  return 0;
}

async function getActiveShift(employeeId, dateObj) {
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: dateObj },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: dateObj } }],
    },
    include: { Shift: true },
    orderBy: { EffectiveFrom: 'desc' },
  });
  return assignment?.Shift || null;
}

function buildShiftWindow(shift, dateStr) {
  if (shift) {
    const start = dayjs(shift.StartTime);
    const end = dayjs(shift.EndTime);
    return {
      checkIn: dayjs(`${dateStr}T${start.format('HH:mm:ss')}`),
      checkOut: dayjs(`${dateStr}T${end.format('HH:mm:ss')}`),
      breakMinutes: shift.BreakDurationMin || 0,
      expectedHours: Number(shift.ExpectedHours),
      shiftId: shift.ShiftID,
    };
  }
  return {
    checkIn: dayjs(`${dateStr}T00:00:00`)
      .hour(DEFAULT_SHIFT.startHour)
      .minute(DEFAULT_SHIFT.startMinute),
    checkOut: dayjs(`${dateStr}T00:00:00`)
      .hour(DEFAULT_SHIFT.endHour)
      .minute(DEFAULT_SHIFT.endMinute),
    breakMinutes: DEFAULT_SHIFT.breakMinutes,
    expectedHours: DEFAULT_SHIFT.expectedHours,
    shiftId: null,
  };
}

async function getHolidaySet(year, month, workLocationId) {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month').toDate();
  const end = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).endOf('month').toDate();

  const holidays = await prisma.holidayCalendar.findMany({
    where: {
      HolidayDate: { gte: start, lte: end },
      OR: [{ WorkLocationID: null }, { WorkLocationID: workLocationId ?? undefined }],
    },
  });

  return new Set(holidays.map((h) => dayjs(h.HolidayDate).format('YYYY-MM-DD')));
}

function getWorkingDaysInMonth(year, month) {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
  const end = start.endOf('month');
  const days = [];
  let cur = start;
  while (cur.isSameOrBefore(end)) {
    if (!isWeekend(cur)) days.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return days;
}

async function seedEmployeeMonth(employee, year, month) {
  const dateStrs = getWorkingDaysInMonth(year, month);
  const holidaySet = await getHolidaySet(year, month, employee.WorkLocationID);

  // Filter out holidays from the candidate working days
  const candidateDates = dateStrs.filter((d) => !holidaySet.has(d));

  // Pick which days will be Absent
  const absenceCount = Math.min(
    randInt(ABSENCES_PER_MONTH_MIN, ABSENCES_PER_MONTH_MAX),
    candidateDates.length
  );
  const shuffled = [...candidateDates].sort(() => Math.random() - 0.5);
  const absentDates = new Set(shuffled.slice(0, absenceCount));

  let created = 0;
  let skippedExisting = 0;

  for (const dateStr of candidateDates) {
    const dateObj = new Date(dateStr);

    // Never overwrite an existing record
    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        UQ_Attendance_EmployeeDate: {
          EmployeeID: employee.EmployeeID,
          AttendanceDate: dateObj,
        },
      },
    });
    if (existing) {
      skippedExisting++;
      continue;
    }

    if (absentDates.has(dateStr)) {
      await prisma.attendanceRecord.create({
        data: {
          EmployeeID: employee.EmployeeID,
          AttendanceDate: dateObj,
          ShiftID: null,
          CheckInTime: null,
          CheckOutTime: null,
          WorkedHours: 0,
          OvertimeHours: 0,
          LatenessMinutes: 0,
          EarlyDepartureMin: 0,
          Status: 'Absent',
          IsManualEntry: true,
          Notes: `${SEED_TAG} Absent`,
        },
      });
      created++;
      continue;
    }

    const shift = await getActiveShift(employee.EmployeeID, dateObj);
    const window = buildShiftWindow(shift, dateStr);

    const latenessMinutes = pickRandomLateness();
    const checkInTime = window.checkIn.add(latenessMinutes, 'minute').toDate();
    const checkOutTime = window.checkOut.toDate();

    const grossHours = dayjs(checkOutTime).diff(dayjs(checkInTime), 'minute') / 60;
    const workedHours = Math.max(0, grossHours - window.breakMinutes / 60);
    const overtimeHours = pickRandomOvertimeHours(window.expectedHours);

    await prisma.attendanceRecord.create({
      data: {
        EmployeeID: employee.EmployeeID,
        AttendanceDate: dateObj,
        ShiftID: window.shiftId,
        CheckInTime: checkInTime,
        CheckOutTime: checkOutTime,
        WorkedHours: parseFloat(workedHours.toFixed(2)),
        OvertimeHours: parseFloat(overtimeHours.toFixed(2)),
        LatenessMinutes: latenessMinutes,
        EarlyDepartureMin: 0,
        Status: latenessMinutes > 0 ? 'Late' : 'Present',
        IsManualEntry: true,
        Notes: `${SEED_TAG} ${latenessMinutes > 0 ? 'Late' : 'Present'}`,
      },
    });
    created++;
  }

  return { created, skippedExisting, absentCount: absentDates.size };
}

async function main() {
  console.log(`\nSeeding attendance for ${MONTHS.join(' & ')} / ${YEAR}...\n`);

  const employees = await prisma.employee.findMany({
    where: { IsActive: true },
    select: { EmployeeID: true, FullName: true, WorkLocationID: true },
  });

  console.log(`Found ${employees.length} active employees.\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalAbsences = 0;

  for (const employee of employees) {
    for (const month of MONTHS) {
      const result = await seedEmployeeMonth(employee, YEAR, month);
      totalCreated += result.created;
      totalSkipped += result.skippedExisting;
      totalAbsences += result.absentCount;
      console.log(
        `  ${employee.FullName.padEnd(30)} | Month ${month}: ` +
          `${result.created} created, ${result.skippedExisting} skipped (existing), ` +
          `${result.absentCount} marked Absent`
      );
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Done.`);
  console.log(`Total records created : ${totalCreated}`);
  console.log(`Total skipped (existing): ${totalSkipped}`);
  console.log(`Total Absent days seeded: ${totalAbsences}`);
  console.log(`──────────────────────────────────────────\n`);
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });