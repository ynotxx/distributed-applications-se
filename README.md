# Social Media App

## Student Information

- Antonio Antonov
- Specialty: Software Engineering
- Faculty Number: 2401321071

---

## Project Description

Social Media App is a full-stack web application developed as coursework for the Web Services course. The system simulates a modern social media platform where users can create accounts, publish posts, follow other users, interact through comments, and receive notifications.

The project is divided into two connected parts:

- **Back-end:** RESTful API developed with PHP and MySQL
- **Front-end:** Single Page Application (SPA) developed with React and Vite

The application implements full CRUD (Create, Read, Update, Delete) functionality for all major database models and follows the requirements for secure communication, validation, filtering, pagination, sorting, and error handling.

---

## Technologies Used

### Back-end

- PHP
- MySQL
- XAMPP
- REST API
- JSON

### Front-end

- React
- Vite
- JavaScript
- CSS

### Database

- MySQL relational database

---

## Main Features

### Authentication & Security

- User registration and login
- Protected API endpoints
- Session/token-based authentication
- Validation on both client and server side

### Users

- Create and manage user profiles
- Follow and unfollow users
- View user information

### Posts

- Create posts
- Edit posts
- Delete posts
- View all posts

### Comments

- Add comments to posts
- Edit comments
- Delete comments

### Notifications

- Notification system for user interactions

### Additional Functionality

- Filtering and searching
- Pagination
- Sorting
- Global error handling
- Asynchronous communication between client and server

---

## Database Structure

The project uses a relational MySQL database with multiple connected tables, including:

- users
- posts
- comments
- follows
- notifications

Each table contains:

- Primary keys
- Required fields
- Data type validation
- Character length restrictions
- Relationships between entities

---

## Project Structure

```txt
Social_Media_PHP/
│
├── backend/
│   ├── auth.php
│   ├── comments.php
│   ├── db.php
│   ├── follows.php
│   ├── notifications.php
│   ├── posts.php
│   ├── users.php
│   └── schema.sql
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

# Installation and Running Instructions

## Requirements

Install the following software before starting the project:

- XAMPP
- Node.js
- npm
- Git (optional)

---

# Back-end Setup

## 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
```

Or download the ZIP archive manually.

---

## 2. Move the project to XAMPP

Place the project folder inside:

```txt
xampp/htdocs/
```

Example:

```txt
xampp/htdocs/Social_Media_PHP
```

---

## 3. Start XAMPP services

Open XAMPP Control Panel and start:

- Apache
- MySQL

---

## 4. Create the database

Open:

```txt
http://localhost/phpmyadmin
```

Create a new database.

Example:

```txt
social_media_db
```

---

## 5. Import the database schema

1. Open the created database
2. Go to the **Import** tab
3. Select:

```txt
backend/schema.sql
```

4. Click **Go**

---

## 6. Configure database connection

Open:

```txt
backend/db.php
```

Update the database credentials if necessary:

```php
$host = "localhost";
$user = "root";
$password = "";
$database = "social_media_db";
```

---

# Front-end Setup

## 1. Open terminal inside frontend folder

```bash
cd frontend
```

---

## 2. Install dependencies

```bash
npm install
```

---

## 3. Start the React development server

```bash
npm run dev
```

---

## 4. Open the application

After starting the frontend server, open the URL shown in the terminal.

Usually:

```txt
http://localhost:5173
```
