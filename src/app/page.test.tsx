import { render, screen } from "@testing-library/react";
import Home from "./page";

test("identifies the build as an independent prototype", () => {
  render(<Home />);
  expect(screen.getByText(/independent hackathon prototype/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /enter demo/i })).toHaveAttribute("href", "/login");
});
