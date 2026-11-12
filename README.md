# TehlayPay
### AI-Powered Procurement. Deterministic Policy Enforcement. Accountable Payments.

**AI can recommend. Your rules decide.**

TehlayPay is an AI-assisted procurement platform that helps organisations make better purchasing decisions while keeping procurement policies, approval authority and payment accountability firmly under human and deterministic control.

It transforms natural-language purchasing requests into structured procurement requirements, discovers relevant products, evaluates them against configurable purchasing policies, and supports an auditable approval-to-payment workflow.

Rather than allowing an AI model to make purchasing decisions, TehlayPay separates AI interpretation from policy enforcement and payment authorisation.

**Live Demo:** https://tlp-2-studio.ai.studio/  
**Source Code:** https://github.com/OreofeJ/TehlayPay  
**Project:** PayPal AI Hackathon 2026  
**Payment Environment:** PayPal Sandbox

---

## 1. The Problem

Procurement decisions are often fragmented across product searches, spreadsheets, policy documents, approval processes and payment systems.

This creates several challenges:

- **Policy inconsistency:** Buyers may overlook budget limits, approved product conditions or procurement requirements.
- **Manual evaluation:** Comparing products against organisational requirements is time-consuming.
- **Limited transparency:** It can be difficult to understand why a product was approved, rejected or escalated.
- **Weak accountability:** Procurement decisions and payment actions may not be connected through a coherent audit trail.
- **AI trust concerns:** AI shopping assistants can recommend products without reliably enforcing the purchasing rules that should govern the transaction.

Organisations need more than an AI assistant that finds products. They need a system that connects intelligent product discovery with enforceable policies, human approval and accountable transactions.

## 2. The Solution

TehlayPay introduces a controlled procurement workflow in which each technology has a clearly defined responsibility.

A buyer describes what they need in natural language. Gemini interprets the request and extracts structured requirements. Channel3 searches for matching products. A deterministic policy engine independently evaluates the products against the active procurement rules.

Every product receives one of three outcomes:

| Decision | Meaning |
|---|---|
| **PASS** | The product satisfies the applicable procurement rules. |
| **BLOCKED** | The product violates a defined policy requirement. |
| **REVIEW** | Important information is missing or requires human assessment. |

The buyer remains responsible for approving a purchase. PayPal Sandbox handles the payment workflow, while TehlayPay records relevant procurement and transaction events.

**The governing principle is simple: AI interprets, policy controls, humans approve and payments are recorded.**

## 3. Key Features

### 3.1 AI-Powered Procurement Agent

Buyers can describe procurement needs in natural language rather than manually completing complicated product-search forms.

The application uses Google's Gemini model to interpret requests and extract structured purchasing requirements, including relevant product categories, budgets and technical specifications.

The procurement workflow is designed for multiple purchasing categories rather than being restricted to laptops or computing equipment.

### 3.2 Deterministic Procurement Policy Engine

This is the central control mechanism of TehlayPay.

The policy engine evaluates products against applicable procurement requirements, including:

- Maximum purchasing budgets.
- Product condition requirements.
- Technical specifications where relevant.
- Category-specific purchasing restrictions.
- Approval thresholds.
- Missing or uncertain product information.

The engine produces PASS, BLOCKED or REVIEW outcomes.

Unlike an AI-generated recommendation, these outcomes are determined by application logic. The AI model does not independently authorise purchases or override procurement rules.

### 3.3 Policy What-If Simulator

The simulator allows users to explore how changes to procurement policies affect purchasing decisions.

Users can assess alternative policy conditions and observe how different requirements influence product eligibility.

This makes procurement rules easier to understand, evaluate and refine before they are applied to an actual purchasing decision.

### 3.4 Intelligent Product Comparison

TehlayPay brings product discovery and structured comparison into one procurement workflow.

Through Channel3 product search and AG Grid-powered comparison interfaces, users can evaluate available products against relevant purchasing requirements.

The objective is not simply to identify the cheapest product, but to help buyers understand which options satisfy their procurement needs and applicable policies.

### 3.5 Procurement Decision Passport

The Procurement Decision Passport provides a structured record of a procurement decision.

It brings together relevant information about the purchasing request, product evaluation, policy outcome, approval and transaction status.

This creates a more transparent record of how a procurement decision was reached and what happened during the purchasing workflow.

### 3.6 Procurement Analytics Dashboard

The standalone analytics dashboard provides a consolidated view of procurement activity and decision patterns.

It helps users explore procurement outcomes and understand how purchasing policies influence decisions.

### 3.7 Controlled PayPal Checkout

After a product has passed the required checks and the buyer has explicitly approved the purchase, TehlayPay supports checkout through PayPal Sandbox.

The server independently validates the purchase against the active policy and trusted product information before creating an order.

Payment capture is recorded only after PayPal confirms successful completion.

**Important:** The hackathon demonstration uses PayPal Sandbox. It does not process live customer payments.

---

## 4. How It Works

TehlayPay follows a controlled, multi-stage workflow:

1. **Describe:** The buyer submits a procurement request in natural language.
2. **Interpret:** Gemini extracts the relevant purchasing requirements.
3. **Discover:** Channel3 retrieves matching products.
4. **Evaluate:** The deterministic policy engine evaluates each product against the applicable rules.
5. **Decide:** Products are classified as PASS, BLOCKED or REVIEW.
6. **Approve:** The buyer explicitly authorises an eligible purchase.
7. **Pay:** PayPal Sandbox processes the checkout workflow.
8. **Record:** TehlayPay maintains procurement and transaction records.

### System Responsibility Model

| Component | Responsibility |
|---|---|
| Google Gemini | Natural-language interpretation and requirements extraction |
| Channel3 | Product discovery and catalogue search |
| TehlayPay Policy Engine | Deterministic procurement policy evaluation |
| AG Grid | Structured product comparison and data presentation |
| Buyer | Explicit purchasing approval |
| PayPal | Sandbox order and payment processing |
| TehlayPay Audit Layer | Procurement and transaction recordkeeping |

This separation is fundamental to the platform: **AI recommendations do not constitute purchasing authorisation.**

## 5. Technology Stack

| Technology | Role |
|---|---|
| React 19 | User interface |
| TypeScript | Application and server-side type safety |
| Vite | Frontend development and build tooling |
| Node.js | Server runtime |
| Express | Backend API |
| Google Gemini via Google GenAI SDK | Natural-language processing |
| Channel3 API | Product discovery |
| AG Grid | Product comparison and data grids |
| PayPal REST APIs | Sandbox checkout and payment processing |
| Bun | Dependency installation and development workflow |
| Tailwind CSS | User-interface styling |
| Motion | Interface animation |
| Lucide React | Interface icons |

## 6. Architecture

TehlayPay uses a React frontend and a TypeScript/Express backend.

The application separates product discovery, procurement evaluation, checkout and audit responsibilities.

### Important project components

| File / Directory | Purpose |
|---|---|
| `src/App.tsx` | Main application interface |
| `src/components/` | Reusable interface components |
| `src/policyEngine/policyEngine.ts` | Deterministic procurement policy engine |
| `src/policyEngine/policyEngine.test.ts` | Policy engine tests |
| `src/shared/categories.ts` | Shared procurement category definitions |
| `src/shared/types.ts` | Shared application types |
| `server.ts` | Express server and API entry point |
| `server/channel3Adapter.ts` | Channel3 product-search integration |
| `server/paypalService.ts` | PayPal integration |
| `server/auditStore.ts` | Audit records and checkout state management |
| `server/checkout.test.ts` | Checkout tests |

The server exposes procurement and checkout endpoints, including:

- `/api/products/search-and-evaluate`
- `/api/requirements/update`
- `/api/checkout/create-order`
- `/api/checkout/capture-order`
- `/api/checkout/cancel-order`

## 7. Security, Policy Enforcement and Trust

TehlayPay is designed around the principle that procurement policy enforcement must not depend solely on AI output or frontend behaviour.

Key safeguards include:

- **Server-side policy evaluation:** The backend independently evaluates purchase eligibility.
- **Trusted product information:** Checkout validation does not blindly trust client-submitted prices or policy outcomes.
- **Active policy validation:** The server checks the current purchasing requirements before creating an order.
- **Fail-closed handling:** Missing or uncertain critical information can trigger REVIEW rather than automatic approval.
- **Category-aware restrictions:** Applicable category-specific rules, including new-condition requirements for consumables, are enforced server-side.
- **Explicit buyer approval:** A purchase requires a deliberate approval action.
- **Checkout safeguards:** Pending order state and duplicate-order protections help prevent unintended repeated purchases.
- **Verified payment status:** A transaction is recorded as successfully captured only when PayPal confirms a completed capture.

These controls are intended to make procurement decisions more consistent, explainable and accountable. They should not be interpreted as a guarantee that every form of fraud, policy abuse or payment risk can be eliminated.

## 8. Installation and Setup

This section describes how to install and run the application from its source repository.

### Prerequisites

Install the following before proceeding:

| Requirement | Description |
|---|---|
| Git | Used to clone the source repository |
| Bun | JavaScript runtime and package manager used by this project |
| API credentials | Required for the external AI, product-search and PayPal Sandbox integrations |

**Bun:** https://bun.sh/

**Git:** https://git-scm.com/downloads

A code editor such as Visual Studio Code is recommended.

### Step 1 — Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/OreofeJ/TehlayPay_v1.git
```

Move into the project directory:

```bash
cd TehlayPay_v1
```

If the repository is private, the developer must have appropriate GitHub access.

### Step 2 — Install dependencies

Install Bun if it is not already available.

Then run:

```bash
bun install
```

This installs the dependencies defined in `package.json` and uses the project's Bun lockfile to maintain dependency consistency.

### Step 3 — Configure environment variables

The repository includes an `.env.example` file containing the environment-variable template.

Create a local `.env` file in the project root.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Open `.env` and populate the required values using your own credentials.

The required integrations include:

- Google Gemini API credentials.
- Channel3 API credentials.
- PayPal Sandbox application credentials.

Use the exact variable names specified in `.env.example` and the corresponding integration configuration.

Do not commit `.env` or expose API keys in frontend code, screenshots, public documentation or source-control history.

### Step 4 — Start the application

Run:

```bash
bun run dev
```

This starts the application through the project's development server script.

Open the local address printed in the terminal to access the application.

### Step 5 — Build the application

To create a production frontend build, run:

```bash
bun run build
```

The generated build output is placed in the project's distribution directory.

### Step 6 — Run the tests

The project includes automated tests for its core procurement and checkout functionality.

Run the complete test suite:

```bash
bun run test
```

Individual test commands are also available:

```bash
bun run test:policy
bun run test:checkout
bun run test:analytics
bun run test:intelligence
```

Run the TypeScript checks with:

```bash
bun run lint
```

**Note:** External integrations require valid credentials and appropriate API access. A successful local build does not, by itself, verify that every external service is configured correctly.

## 9. Environment and Payment Configuration

### Google Gemini

Gemini is used to interpret natural-language procurement requests and extract structured requirements.

Configure the API credential using the variable specified in `.env.example`.

### Channel3

Channel3 provides product-search capabilities through its API.

Documentation:

- https://docs.trychannel3.com/guides/make-a-search
- https://docs.trychannel3.com/guides/response-overview

Configure the Channel3 API credential in the backend environment.

### PayPal Sandbox

PayPal Sandbox is used for the demonstration checkout workflow.

Developers should configure their own Sandbox application credentials and use the appropriate Sandbox accounts when testing.

PayPal developer resources:

- https://developer.paypal.com/

Never substitute production credentials into the hackathon demonstration environment.

---

## 10. Demonstration

The live demonstration is available here:

**https://tlp-2-studio.ai.studio/**

The demonstration showcases the procurement workflow and its supporting intelligence features:

1. Natural-language procurement requests.
2. AI-assisted requirements extraction.
3. Product discovery and comparison.
4. Deterministic policy decisions.
5. Policy What-If simulation.
6. Procurement analytics.
7. Procurement Decision Passport.
8. Buyer-approved PayPal Sandbox checkout.

The demonstration is intended to show how intelligent product discovery can operate within a controlled procurement and accountability framework.

## 11. Innovation and Potential Impact

TehlayPay addresses a practical gap between AI-powered product recommendations and the controls required for responsible organisational purchasing.

Its key contribution is the integration of:

- Natural-language procurement intelligence.
- Multi-category product discovery.
- Deterministic and server-enforced procurement policies.
- Interactive policy simulation.
- Structured product comparison.
- Human-controlled purchasing approval.
- Payment integration and decision recordkeeping.

Potential applications include:

- Small and medium-sized businesses.
- Corporate procurement departments.
- Educational institutions.
- Public-sector purchasing teams.
- Distributed organisations.
- Organisations seeking more transparent purchasing controls.

By making procurement requirements explicit and connecting them to product eligibility and transaction records, TehlayPay aims to make purchasing decisions easier to evaluate, explain and audit.

## 12. Project Status and Limitations

TehlayPay is a hackathon prototype demonstrating an integrated AI-assisted procurement workflow.

The current demonstration uses PayPal Sandbox, not live payment processing.

Production deployment would require further work on matters such as:

- Authentication and role-based access control.
- Persistent, production-grade audit storage.
- Organisation-level policy administration.
- Production payment configuration and operational controls.
- Supplier and product-data verification.
- Deployment hardening, monitoring and compliance review.

The project should therefore be understood as a functional demonstration of the proposed procurement architecture, not as a fully certified enterprise procurement or payment platform.

## 13. Hackathon Acknowledgements

Built for the **PayPal AI Hackathon 2026**.

TehlayPay integrates AI-assisted interpretation, product discovery, deterministic policy enforcement, structured data presentation and PayPal Sandbox checkout into one procurement workflow.

The project also demonstrates the use of the following technologies and services:

- Google Gemini
- Channel3
- AG Grid
- PayPal Sandbox
- React and TypeScript

## 14. Licence

TehlayPay is released under the **MIT License**.

You are free to use, copy, modify, merge, publish, distribute, sublicense and commercially use the software, subject to the conditions of the MIT License.

The full licence terms are available in the [`LICENSE`](./LICENSE) file in the root of this repository.

**TehlayPay — AI can recommend. Your rules decide.**
