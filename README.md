# Sonder

**Факултетен номер:** 2401321071  
**Име на проекта:** Sonder  

## Описание:
Sonder е уеб базирана социална платформа, разработена с React и PHP REST API. Проектът позволява управление на потребителски профили, публикации, коментари, харесвания и следвания между потребители.

Системата се състои от:
- React SPA (Single Page Application) клиент за потребителски интерфейс.
- PHP REST API за обработка на заявки, автентикация и работа с базата данни.
- MySQL база данни за съхранение на потребители, публикации, коментари, последвания и известия.

### Функционалности:
- Регистрация и вход в системата.
- Създаване, редактиране и изтриване на публикации.
- Добавяне и изтриване на коментари.
- Харесване на публикации и коментари.
- Follow / Unfollow между потребители.
- Известия за взаимодействия.
- Търсене, филтриране, сортиране и странициране на съдържание.

---

## Съдържание:
- `frontend` – React SPA клиент.
- `backend` – PHP REST API.
- `schema.sql` – SQL структура на базата данни.

---

# Инсталация и стартиране

## Изисквания:
- [Node.js](https://nodejs.org/)
- [XAMPP](https://www.apachefriends.org/)
- MySQL
- PHP 8+

---

## Стъпки:

### 1. Клониране на repository:
```bash
git clone https://github.com/ynotxx/distributed-applications-se.git
cd distributed-applications-se/course-work/implementations/Sonder
```

---

### 2. Настройване на backend-а:

Преместете папката `backend` в:

```txt
xampp/htdocs/backend
```

Стартирайте:
- Apache
- MySQL

---

### 3. Създаване на базата данни:

Създайте MySQL база данни с име:

```txt
backend
```

Импортирайте файла:

```txt
schema.sql
```

---

### 4. Стартиране на frontend-а:

Отворете терминал в папката `frontend` и изпълнете:

```bash
npm install
npm run dev
```

---

### 5. Отваряне на приложението:

🔹 **Frontend (React SPA)**  
- `http://localhost:5173`

🔸 **Backend API (PHP REST API)**  
- `http://localhost/backend`

---

# Използвани технологии

## Frontend:
- React
- Vite
- JavaScript
- CSS

## Backend:
- PHP
- REST API
- PDO
- MySQL