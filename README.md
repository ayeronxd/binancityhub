# Barangay Hub
[![Ask DeepWiki](https://devin.ai/assets/askdeepwiki.png)](https://deepwiki.com/ayeronxd/binancityhub.git)

Barangay Hub is a serverless web application designed as a smart city portal. It provides a unified platform for residents, public users, and administrators to interact with city services and data. The application is built with Vanilla JavaScript and Bootstrap 5, using Supabase for authentication, database (Postgres), and security via Row Level Security (RLS).

## Key Features

*   **Role-Based Access Control**: Securely manages user experiences for different roles.
*   **Dynamic Analytics Dashboard**: Live counters and charts visualize real-time operational data.
*   **Resident Services Portal**: Allows residents to apply for official documents and track status.
*   **Interactive Community Announcements**: Features an announcements feed with social engagement. Authenticated users can "Like" and leave comments on official announcements.
*   **Verified Worker Ratings & Registry**: A searchable directory of skilled workers. Residents can submit a "Mark Job as Done" request after a service. Once verified by an Admin, the resident unlocks the ability to leave a 1-to-5 star rating, preventing spam and ensuring trust.
*   **Human-Computer Interaction (HCI) Compliant**: Strict adherence to accessibility (A11y) standards including ARIA labels, standardized visual feedback (scale animations, focus rings), and consistent affordances.
*   **Comprehensive Admin Panel**: A powerful interface for administrators to manage city operations, including approving document requests, announcements, and verifying completed worker services.

## Technology Stack

*   **Frontend**: HTML5, CSS3, Vanilla JavaScript
*   **Backend & Database**: [Supabase](https://supabase.com/)
    *   **Authentication**: Supabase Auth for user login and signup.
    *   **Database**: Supabase Postgres for all data storage.
    *   **Security**: Row Level Security (RLS) to enforce data access policies directly in the database.
*   **Styling**: [Bootstrap 5](https://getbootstrap.com/) & Custom CSS
*   **Charting**: [Chart.js](https://www.chartjs.org/) for data visualization.

## Setup and Installation

To run this project locally, follow these steps:

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/ayeronxd/binancityhub.git
    cd binancityhub
    ```

2.  **Create a Supabase Project**
    *   Go to [supabase.com](https://supabase.com) and create a new project.
    *   Keep your **Project URL** and **`anon` public key** handy.

3.  **Set up the Database Schema**
    *   In your Supabase project, navigate to the **SQL Editor**.
    *   Open the `supabase-schema.sql` file from this repository.
    *   Copy its entire content, paste it into the SQL Editor, and click **Run**. This will create all necessary tables, views, functions, triggers, and Row Level Security policies.

4.  **Configure Supabase Client**
    *   Open `supabase-config.js`.
    *   Replace the placeholder values for `window.BCH_SUPABASE_URL` and `window.BCH_SUPABASE_ANON_KEY` with your project's URL and anon key.

    ```javascript
    // supabase-config.js
    window.BCH_SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
    window.BCH_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
    ```

5.  **Create an Admin User**
    *   Sign up for a new account through the application's UI.
    *   Go back to the Supabase **SQL Editor** and run the following command to promote your user to a super admin. Replace the email with the one you used to sign up.

    ```sql
    update public.profiles
    set role = 'super_admin'
    where email = 'your-email@example.com';
    ```

6.  **Run the Application**
    *   Serve the project files using a local web server (e.g., VS Code Live Server).
    *   Open `index.html` in your browser.

## Database-Driven Architecture

This project is architected to be serverless, meaning the frontend communicates directly with the Supabase database. All dynamic content is fetched from the database, eliminating hardcoded data and ensuring the UI always reflects the current state of operations.

*   **Single Source of Truth**: The Postgres database is the single source of truth for all data.
*   **Row Level Security (RLS)**: RLS is critical to the security model. Policies are defined in `supabase-schema.sql` to ensure users can only access or modify data they are permitted to. For example, a resident can only view their own document requests, while a `barangay_admin` can view all requests within their assigned barangay.

## File Structure

*   `index.html`: The main public and resident-facing portal.
*   `login.html`: The user authentication (login and signup) page.
*   `admin.html`: The administrative dashboard for managing city operations.
*   `main.js`: Handles logic for the public/resident portal (`index.html`), including data fetching and rendering.
*   `auth.js`: Manages user authentication flows and role-based redirects.
*   `admin.js`: Powers the administrative dashboard (`admin.html`), including CRUD operations and data management.
*   `supabase-config.js`: Centralized configuration for the Supabase client.
*   `supabase-schema.sql`: The complete SQL script to set up the database schema, including tables, views, triggers, and RLS policies.
*   `main.css`, `auth.css`, `admin.css`: Custom stylesheets for the different sections of the application.
