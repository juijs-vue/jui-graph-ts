/**
 * Time utility module - ported from jui-graph's util/time.js
 * Provides time difference calculation, time addition, and date formatting
 */

// Constants for time units in milliseconds
/** Milliseconds per SECOND (`1000`) - despite the name, this is the divisor `diff()` uses to
 * convert a millisecond delta into seconds, not "how many ms are in one ms" - a naming mismatch
 * with its `MINUTE`/`HOUR`/`DAY` siblings (which are correctly named for what they divide into),
 * preserved as-is rather than renamed. */
export const MILLISECOND = 1000;
/** Milliseconds per minute (`60000`) - `diff()`'s divisor for `type === "minutes"`. */
export const MINUTE = 1000 * 60;
/** Milliseconds per hour (`3600000`) - `diff()`'s divisor for `type === "hours"`. */
export const HOUR = 1000 * 60 * 60;
/** Milliseconds per day (`86400000`) - `diff()`'s divisor for `type === "days"`. */
export const DAY = 1000 * 60 * 60 * 24;

// Unit string constants
/** The `unit` string `add(date, years, amount)` expects to add whole years. */
export const years = "years";
/** The `unit` string `add(date, months, amount)` expects to add whole months. */
export const months = "months";
/** The `unit` string `add(date, days, amount)` expects to add whole days. */
export const days = "days";
/** The `unit` string `add(date, hours, amount)` expects to add whole hours. */
export const hours = "hours";
/** The `unit` string `add(date, minutes, amount)` expects to add whole minutes. */
export const minutes = "minutes";
/** The `unit` string `add(date, seconds, amount)` expects to add whole seconds. */
export const seconds = "seconds";
/** The `unit` string `add(date, milliseconds, amount)` expects to add raw milliseconds. */
export const milliseconds = "milliseconds";
/** The `unit` string `add(date, weeks, amount)` expects to add whole weeks (7-day increments). */
export const weeks = "weeks";

/**
 * Calculate time difference from a to b
 * @param type - unit type: 'seconds', 'minutes', 'hours', 'days', or other (returns milliseconds)
 * @param a - first date
 * @param b - second date
 * @returns number - difference in specified units
 */
export function diff(type: string, a: Date | number, b: Date | number): number {
    const millisecondsDiff = (+a) - (+b);

    if (type === "seconds") {
        return Math.abs(Math.floor(millisecondsDiff / MILLISECOND));
    } else if (type === "minutes") {
        return Math.abs(Math.floor(millisecondsDiff / MINUTE));
    } else if (type === "hours") {
        return Math.abs(Math.floor(millisecondsDiff / HOUR));
    } else if (type === "days") {
        return Math.abs(Math.floor(millisecondsDiff / DAY));
    }

    return millisecondsDiff;
}

/**
 * Add time to a date
 * Variadic function that accepts pairs of (unit, amount)
 *
 * Example:
 *   const date = new Date();
 *   add(date, hours, 1); // add an hour
 *   add(date, hours, 1, minutes, 30); // add an hour and 30 minutes
 *
 * @param date - date to add time to
 * @param args - variadic pairs of (unit, amount)
 * @returns Date - new date with time added
 */
export function add(date: Date, ...args: (string | number)[]): Date {
    if (args.length <= 1) {
        return date;
    }

    const d = new Date(+date);

    for (let i = 0; i < args.length; i += 2) {
        const unitArg = args[i];
        const amount = args[i + 1] as number;

        // Resolve unit string reference
        let unit = unitArg;
        if (typeof unitArg === "string") {
            unit = unitArg;
        }

        if (unit === years) {
            d.setFullYear(d.getFullYear() + amount);
        } else if (unit === months) {
            d.setMonth(d.getMonth() + amount);
        } else if (unit === days) {
            d.setDate(d.getDate() + amount);
        } else if (unit === hours) {
            d.setHours(d.getHours() + amount);
        } else if (unit === minutes) {
            d.setMinutes(d.getMinutes() + amount);
        } else if (unit === seconds) {
            d.setSeconds(d.getSeconds() + amount);
        } else if (unit === milliseconds) {
            d.setMilliseconds(d.getMilliseconds() + amount);
        } else if (unit === weeks) {
            d.setDate(d.getDate() + amount * 7);
        }
    }

    return d;
}

/**
 * Format a date string
 * Implements date format using these patterns:
 * - yyyy: 4-digit year
 * - yy: 2-digit year
 * - y: 1-digit year
 * - MMMM: full month name
 * - MMM: 3-letter month name
 * - MM: 2-digit month
 * - M: month number
 * - dd: 2-digit day
 * - d: day number
 * - dddd: full day name
 * - ddd: 3-letter day name
 * - HH: 2-digit hour (24h)
 * - H: hour (24h)
 * - hh: 2-digit hour (12h)
 * - h: hour (12h)
 * - mm: 2-digit minute
 * - m: minute
 * - ss: 2-digit second
 * - s: second
 * - fff: 3-digit millisecond
 * - ff: 2-digit millisecond (rounded)
 * - f: 1-digit millisecond (rounded)
 * - TT: AM/PM
 * - T: A/P
 * - tt: am/pm
 * - t: a/p
 * - K: timezone offset
 *
 * @param date - date to format
 * @param format - format string
 * @param utc - use UTC time (default: false)
 * @returns string - formatted date string
 */
export function format(date: Date, format: string, utc?: boolean): string {
    const MMMM = ["\x00", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MMM = ["\x01", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dddd = ["\x02", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const ddd = ["\x03", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function ii(i: number, len?: number): string {
        let s = i + "";
        len = len || 2;
        while (s.length < len) s = "0" + s;
        return s;
    }

    let result = format;

    // Year
    const y = utc ? date.getUTCFullYear() : date.getFullYear();
    result = result.replace(/(^|[^\\])yyyy+/g, "$1" + y);
    result = result.replace(/(^|[^\\])yy/g, "$1" + y.toString().substr(2, 2));
    result = result.replace(/(^|[^\\])y/g, "$1" + y);

    // Month
    const M = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
    result = result.replace(/(^|[^\\])MMMM+/g, "$1" + MMMM[0]);
    result = result.replace(/(^|[^\\])MMM/g, "$1" + MMM[0]);
    result = result.replace(/(^|[^\\])MM/g, "$1" + ii(M));
    result = result.replace(/(^|[^\\])M/g, "$1" + M);

    // Day of month
    const d = utc ? date.getUTCDate() : date.getDate();
    result = result.replace(/(^|[^\\])dddd+/g, "$1" + dddd[0]);
    result = result.replace(/(^|[^\\])ddd/g, "$1" + ddd[0]);
    result = result.replace(/(^|[^\\])dd/g, "$1" + ii(d));
    result = result.replace(/(^|[^\\])d/g, "$1" + d);

    // Hour
    const H = utc ? date.getUTCHours() : date.getHours();
    result = result.replace(/(^|[^\\])HH+/g, "$1" + ii(H));
    result = result.replace(/(^|[^\\])H/g, "$1" + H);

    const h = H > 12 ? H - 12 : H == 0 ? 12 : H;
    result = result.replace(/(^|[^\\])hh+/g, "$1" + ii(h));
    result = result.replace(/(^|[^\\])h/g, "$1" + h);

    // Minute
    const m = utc ? date.getUTCMinutes() : date.getMinutes();
    result = result.replace(/(^|[^\\])mm+/g, "$1" + ii(m));
    result = result.replace(/(^|[^\\])m/g, "$1" + m);

    // Second
    const s = utc ? date.getUTCSeconds() : date.getSeconds();
    result = result.replace(/(^|[^\\])ss+/g, "$1" + ii(s));
    result = result.replace(/(^|[^\\])s/g, "$1" + s);

    // Millisecond
    let f = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
    result = result.replace(/(^|[^\\])fff+/g, "$1" + ii(f, 3));
    f = Math.round(f / 10);
    result = result.replace(/(^|[^\\])ff/g, "$1" + ii(f));
    f = Math.round(f / 10);
    result = result.replace(/(^|[^\\])f/g, "$1" + f);

    // AM/PM
    const T = H < 12 ? "AM" : "PM";
    result = result.replace(/(^|[^\\])TT+/g, "$1" + T);
    result = result.replace(/(^|[^\\])T/g, "$1" + T.charAt(0));

    const t = T.toLowerCase();
    result = result.replace(/(^|[^\\])tt+/g, "$1" + t);
    result = result.replace(/(^|[^\\])t/g, "$1" + t.charAt(0));

    // Timezone
    let tz = -date.getTimezoneOffset();
    let K = utc || !tz ? "Z" : tz > 0 ? "+" : "-";
    if (!utc) {
        tz = Math.abs(tz);
        const tzHrs = Math.floor(tz / 60);
        const tzMin = tz % 60;
        K += ii(tzHrs) + ":" + ii(tzMin);
    }
    result = result.replace(/(^|[^\\])K/g, "$1" + K);

    // Day of week
    const day = (utc ? date.getUTCDay() : date.getDay()) + 1;
    result = result.replace(new RegExp(dddd[0], "g"), dddd[day]);
    result = result.replace(new RegExp(ddd[0], "g"), ddd[day]);

    // Month names
    result = result.replace(new RegExp(MMMM[0], "g"), MMMM[M]);
    result = result.replace(new RegExp(MMM[0], "g"), MMM[M]);

    // Escape sequences
    result = result.replace(/\\(.)/g, "$1");

    return result;
}
