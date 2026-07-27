import express from "express";
import jwt from "jsonwebtoken";
// import cors from "cors";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";

const server = express();

server.use(express.json());

// It is working without cors, because I am using server-actions in nextJs frontend.
// server.use(
//   cors({
//     origin: process.env.CLIENT_URL, // nextJs frontend url
//     credentials: true,
//   }),
// );
server.use(cookieParser());

// in memory db for now
let users = []; // [{ id, email, password }]
let todos = []; // [{ id, userId, title, completed }]

const jwtSecret = process.env.JWT_SECRET || "some_secret";

server.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required!",
      });
    }

    const foundUser = users.find((user) => user.email === email);
    if (foundUser) {
      return res.status(400).json({
        message: "you are already registered!",
      });
    }

    const encryptedPassword = await bcrypt.hash(password, 10);

    users.push({
      id: Date.now(),
      email,
      password: encryptedPassword,
    });

    res.status(201).json({
      message: "user registered successfully!",
    });
  } catch (error) {
    res.status(500).json({
      message: "Something went wrong during signup.",
    });
  }
});

server.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "email is required!",
      });
    }

    if (!password) {
      return res.status(400).json({
        message: "password is required!",
      });
    }

    // if provided email or password is incorrect
    const foundUser = users.find((user) => user.email === email);
    if (!foundUser) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }
    const isPasswordMatching = await bcrypt.compare(
      password,
      foundUser.password,
    );
    if (!isPasswordMatching) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    // // first approach : send cookie by express backend
    // const newToken = jwt.sign(
    //   {
    //     id: foundUser.id,
    //     email,
    //   },
    //   jwtSecret,
    //   { expiresIn: "5m" },
    // );
    // res.cookie("token", newToken, {
    //   httpOnly: true, // Prevents client-side JS (XSS attacks) from reading the cookie
    //   secure: process.env.NODE_ENV === "production", // Sent over HTTPS only in production
    //   sameSite: "lax", // Protects against Cross-Site Request Forgery (CSRF)
    //   maxAge: 5 * 60 * 1000, // 5min expiry (in milliseconds)
    // });
    // res.status(200).json({
    //   message: "login successful!",
    // });

    // second approach : send token in body and let nextJs set the cookie (recommended for Next.js)
    const newToken = jwt.sign(
      {
        id: foundUser.id,
        email,
      },
      jwtSecret,
      { expiresIn: "5m" },
    );

    // Return token in JSON body — let Next.js set the cookie
    res.status(200).json({
      message: "login successful!",
      token: newToken,
    });

  } catch (error) {
    res.status(500).json({
      message: "Something went wrong during login.",
    });
  }
});

function authenticateToken(req, res, next) {
  // 1. Extract token from either cookie OR Authorization header
  const tokenFromWebSite = req.cookies?.token; // if frontend is web-app
  const tokenFromMobileApp = req.headers["authorization"]?.split(" ")[1]; // if frontend is android/ios app
  // 2. Extract the token
  const token = tokenFromMobileApp || tokenFromWebSite;

  // 3. If no token, return 401 (Unauthorized)
  if (!token) {
    return res.status(401).json({ error: "Access denied: No token provided" });
  }
  // 4. Verify token using jwt.verify(token, jwtSecret, (err, decoded) => { ... })

  try {
    const decodedUser = jwt.verify(token, jwtSecret);
    // 5. Attach decoded.id to req.userId
    req.user = decodedUser;
    // 6. Call next()
    next();
  } catch (err) {
    // 7. Check specifically for expiration
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Access token expired",
        expiredAt: err.expiredAt,
      });
    }

    // 8. If err, return 403 (Forbidden)
    // Catches JsonWebTokenError (signature mismatch, malformed payload, etc.)
    return res.status(403).json({
      error: "Invalid or tampered token",
    });
  }
}

server.get("/todos", authenticateToken, (req, res) => {
  const userId = Number(req.user.id);

  const filteredTodos = todos.filter((todo) => todo.userId === userId);

  return res.status(200).json({
    message: "todos fetched successfully",
    todos: filteredTodos,
  });
});

server.post("/todos", authenticateToken, (req, res) => {
  const title = req.body.title?.trim();
  const userId = Number(req.user.id);

  if (title === undefined || title.trim() === "") {
    return res.status(400).json({
      error: "todo title not provided!",
    });
  }

  const newTodo = {
    id: Date.now(),
    userId,
    title,
    isCompleted: false,
  };
  todos.push(newTodo);

  return res.status(201).json({
    message: "todo created successfully!",
    todo: newTodo,
  });
});

function authorize(req, res, next) {
  const todoId = Number(req.params.id);
  const userId = Number(req.user.id);

  // check if requested todo exists or not
  const todo = todos.find((todo) => todo.id === todoId);
  if (!todo) {
    return res.status(404).json({
      error: "Todo not found!",
    });
  }

  if (todo.userId !== userId) {
    return res.status(403).json({
      error: "Unauthorised action",
    });
  }

  req.todo = todo; // attach found todo to the request object so that we don't have to find it again in patch and delete requests
  next();
}

server.patch("/todos/:id", authenticateToken, authorize, (req, res) => {
  // const todoId = req.params.id;
  const userId = Number(req.user.id);
  const foundTodo = req.todo;

  // if user sends title in body
  const newTitle = req.body.title;
  if (newTitle !== undefined && newTitle.trim() !== "") {
    foundTodo.title = newTitle.trim();
  }

  // if user sends isCompleted in body
  const newIsCompleted = req.body.isCompleted;
  if (newIsCompleted !== undefined) {
    foundTodo.isCompleted = Boolean(newIsCompleted);
  }

  const filteredTodos = todos.filter((todo) => todo.userId === userId);

  return res.status(200).json({
    message: "todo updated successfully",
    todos: filteredTodos,
  });
});

server.delete("/todos/:id", authenticateToken, authorize, (req, res) => {
  // const todoId = Number(req.params.id);
  const userId = Number(req.user.id);

  todos = todos.filter((todo) => todo.id !== req.todo.id);

  const filteredTodos = todos.filter((todo) => todo.userId === userId);

  return res.status(200).json({
    message: "todo deleted successfully",
    todos: filteredTodos,
  });
});

const port = process.env.PORT;
server.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
