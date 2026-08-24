"use client";

import { useState } from "react";

import { ContributionActions } from "./contribution-actions";

interface ContributionRow {
  establishmentName: string;
  wageMonth: string;
  employeeEpf: number;
  employerEpf: number;
  employerEps: number;
  postingStatus: "POSTED" | "MISSING" | "DELAYED";
}

function formatRupees(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

export function ContributionTable({ contributions }: { contributions: ContributionRow[] }) {
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  let runningTotal = 0;
  const chronologicalRows = [...contributions]
    .sort((left, right) => left.wageMonth.localeCompare(right.wageMonth))
    .map((row) => {
      if (row.postingStatus === "POSTED") {
        runningTotal += row.employeeEpf + row.employerEpf;
      }
      return { row, runningTotal };
    });
  const rowsWithTotals = [...chronologicalRows].reverse();
  const pageCount = Math.max(1, Math.ceil(rowsWithTotals.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const firstRowIndex = (visiblePage - 1) * pageSize;
  const visibleRows = rowsWithTotals.slice(firstRowIndex, firstRowIndex + pageSize);
  const firstVisibleNumber = rowsWithTotals.length === 0 ? 0 : firstRowIndex + 1;
  const lastVisibleNumber = Math.min(firstRowIndex + pageSize, rowsWithTotals.length);

  return (
    <div className="contribution-table-shell">
      <div className="contribution-table-wrap">
        <table className="contribution-table" aria-label="Monthly contribution records">
          <caption className="sr-only">Monthly employee EPF, employer EPF, employer EPS, posting status, running total, and demo controls.</caption>
          <thead>
            <tr>
              <th>Wage month</th>
              <th>Employee EPF</th>
              <th>Employer EPF</th>
              <th>Employer EPS</th>
              <th>Status</th>
              <th>Running EPF</th>
              <th>Demo action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, runningTotal: rowRunningTotal }) => {
              return (
                <tr data-status={row.postingStatus.toLowerCase()} key={row.wageMonth}>
                  <td>{row.wageMonth}</td>
                  <td>{formatRupees(row.employeeEpf)}</td>
                  <td>{formatRupees(row.employerEpf)}</td>
                  <td>{formatRupees(row.employerEps)}</td>
                  <td><span>{row.postingStatus.replaceAll("_", " ")}</span></td>
                  <td>{formatRupees(rowRunningTotal)}</td>
                  <td><ContributionActions missing={row.postingStatus !== "POSTED"} wageMonth={row.wageMonth} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="contribution-pagination">
        <label>
          <span>Rows per page</span>
          <select
            aria-label="Rows per page"
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setCurrentPage(1);
            }}
            value={pageSize}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
        <p aria-live="polite">Showing {firstVisibleNumber}–{lastVisibleNumber} of {rowsWithTotals.length}</p>
        <nav aria-label="Contribution table pages">
          <button disabled={visiblePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button">Previous</button>
          <span>Page {visiblePage} of {pageCount}</span>
          <button disabled={visiblePage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} type="button">Next</button>
        </nav>
      </footer>
    </div>
  );
}
