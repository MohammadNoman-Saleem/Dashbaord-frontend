
Context. This is the Saleem internal dashboard (Next.js 14 on Vercel, server side, reads Zoho CRM). It shows two consultation revenue numbers: gross, meaning the money patients actually transacted, and net, meaning Saleem's own cut after the doctor's share. The numbers it produces are coming out wrong. Before we change anything, I want to understand exactly how the current code arrives at them.

Do not change any code in this pass. This is an investigation and explanation task only. I will read your understanding, confirm or correct it, and then we will decide the fix together in a second pass.

## Part 1: explain the current logic

Trace the current implementation and explain, in plain language, how it computes gross and net today. Be concrete and cite the files and functions.

1. Entry point and flow. Which file and function computes the consultation gross and net (for example a get_financials path)? Walk the flow from the data fetch to the final two numbers.

2. Data source and query. What does it read from, Zoho CRM Appointment_Bookings or somewhere else? Show the exact query. If it is COQL, show the SELECT, the WHERE, the date filter and its timezone offset, and how it paginates. List every field it reads (Status, Rate, Doctor, Type, and anything else).

3. Which consults it counts. What exact set of Status values does the code treat as a completed, counted consult for revenue? Quote the code that does this. Call out any status it includes or excludes that you are not sure about.

4. Gross. How is gross calculated from those rows, field by field?

5. Standard versus Novo. Saleem runs two consultation tracks, a standard track and a Novo (obesity) track, and they are priced differently. How does the current code tell them apart? Which field does it read, what values does it match on, and does it normalize the value (trim, lowercase) before matching? Quote the code.

6. Net. How is net calculated, step by step. Specifically:
   - Is there a service charge, and where does its value come from (a constant, a config, or a field on the row)?
   - Is there a commission, and is the rate the same for every doctor or set per doctor? Where does the rate come from (hardcoded, config, or a field)?
   - How is a Novo consult priced for net compared to a standard one?
   - Is there any rounding, and where?
   Quote the code for each point.

7. Fields that may be unreliable. Flag any field the code depends on that could be a problem: a hidden field that may not be readable through the API, a free-text field with inconsistent values, a reserved word in COQL (for example From or Type) that may not select cleanly, or a field that is empty on many rows.

## Part 2: show me the data, do not just describe it

Run the current calculation on the last three full months of real Appointment_Bookings data and print, per month, without changing the code:

- Every Status value present, with the row count and the sum of Rate for each.
- Every distinct Type value present, shown raw and again after trim and lowercase, with a row count for each.
- For the rows the code counts as completed: a table with Doctor, Rate, Type (raw and normalized), the track the code assigned it (standard or Novo), the commission rate the code used, and the net the code computed for that row.
- The final gross and net the code outputs for the month.

If you cannot reach the live data from where you are running, say so, give me the exact query to run myself, and tell me the precise breakdown you want back in the same shape as above.

I will compare these totals to figures I already have. Do not ask me for those figures, and do not hardcode any target numbers. Just produce the breakdown and the totals.

## How to answer

Give me:
- A short written explanation of the current logic, following the numbered points in Part 1.
- The data breakdown from Part 2 for the three months.
- A clear list of the assumptions you had to make, and anything in the current logic that looks inconsistent, fragile, or that you could not fully follow.
- A list of specific questions for me, wherever the code is ambiguous or a business rule is not obvious from the code alone.

Then stop. Do not propose or write a fix in this pass. Once I have read your understanding and corrected anything that is off, I will give you the intended calculation and we will work out the changes together.
