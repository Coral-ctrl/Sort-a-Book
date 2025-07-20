import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import "dotenv/config";


const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "books",
  password: process.env.MY_PASSWORD,
  port: 5433,
});
db.connect();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");


// Routes
app.get("/", async (req, res) => {
  try {
    const sort = req.query.sort;
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const offset = (page - 1) * limit;
    const added = req.query.added || null;
    const deleted = req.query.deleted || null;

    let query = "SELECT * FROM picturebooks";
    const conditions = [];
    const values = [];

    // Add WHERE clause if filtering by category
    if (category) {
      values.push(category);
      conditions.push(`$${values.length} = ANY(categories)`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Add sorting
    if (sort === "recent") {
      query += " ORDER BY date_added DESC";
    } else if (sort === "title") {
      query += " ORDER BY title ASC";
    }

    values.push(limit, offset);
    query += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

    const booksResult = await db.query(query, values);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM picturebooks";
    if (conditions.length > 0) {
      countQuery += " WHERE " + conditions.join(" AND ");
    }
    const countResult = await db.query(countQuery, values.slice(0, conditions.length));
    const totalBooks = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalBooks / limit);

    res.render("index.ejs", { 
      books: booksResult.rows, 
      category,
      currentPage: page,
      totalPages,
      sort,
      added,
      deleted
     });
  } catch (err) {
    console.error("Error fetching books:", err);
    res.status(500).send("Error loading books.");
  }
});


app.post("/add", async (req, res) => {
  const { title, author, illustrator, isbn, description, date_added } = req.body;
  let categories = req.body.categories;
  const finalDate = date_added || new Date().toISOString().split("T")[0];

  // Convert to array if only one category was selected
  if (!Array.isArray(categories)) {
    categories = categories ? [categories] : [];
  }

  try {
    await db.query(
      `INSERT INTO picturebooks (title, author, illustrator, isbn, description, date_added, categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [title, author, illustrator, isbn, description, finalDate, categories]
    );
    res.redirect("/?added=1");
  } catch (err) {
    console.error("Error adding book:", err);
    res.status(500).send("Error adding book.");
  }
});



app.get("/book/:id", async (req, res) => {
  const bookId = req.params.id;
  const category = req.query.category || null;
  const sort = req.query.sort || null;


  try {
    const result = await db.query("SELECT * FROM picturebooks WHERE id = $1", [bookId]);

    if (result.rows.length === 0) {
      return res.status(404).send("Book not found");
    }

    const book = result.rows[0];
    res.render("book.ejs", { 
      book,
      category,
      sort
    });
  } catch (err) {
    console.error("Error fetching book:", err);
    res.status(500).send("Error loading book.");
  }
});


app.get("/book/:id/edit", async (req, res) => {
  const bookId = req.params.id;
  const category = req.query.category || null;
  const sort = req.query.sort || null;

  try {
    const result = await db.query("SELECT * FROM picturebooks WHERE id = $1", [bookId]);

    if (result.rows.length === 0) {
      return res.status(404).send("Book not found");
    }

    const book = result.rows[0];
    res.render("edit.ejs", { 
      book,
      category,
      sort
    });
  } catch (err) {
    console.error("Error loading book for edit:", err);
    res.status(500).send("Error loading book for edit.");
  }
});


app.post("/book/:id/edit", async (req, res) => {
  const bookId = req.params.id;
  const { title, author, illustrator, isbn, description, date_added } = req.body;
  let categories = req.body.categories;
  if (!Array.isArray(categories)) {
    categories = categories ? [categories] : [];
  }

  try {
    await db.query(
      `UPDATE picturebooks SET title=$1, author=$2, illustrator=$3, isbn=$4, description=$5, date_added=$6, categories=$7 WHERE id=$8`,
      [title, author, illustrator, isbn, description, date_added, categories, bookId]
    );
    res.redirect(`/book/${bookId}`);
  } catch (err) {
    console.error("Error updating book:", err);
    res.status(500).send("Error updating book.");
  }
});


app.post("/book/:id/delete", async (req, res) => {
  const bookId = req.params.id;
  try {
    await db.query("DELETE FROM picturebooks WHERE id = $1", [bookId]);
    res.redirect("/?deleted=1");
  } catch (err) {
    console.error("Error deleting book:", err);
    res.status(500).send("Error deleting book.");
  }
});


app.get("/search", async (req, res) => {
  const keyword = req.query.q || "";
  const category = req.query.category || null;
  const sort = req.query.sort || null;

  try {
    const result = await db.query(`
      SELECT * FROM picturebooks
      WHERE title ILIKE $1 OR author ILIKE $1 OR illustrator ILIKE $1 OR description ILIKE $1`,
      [`%${keyword}%`]
    );

    res.render("index.ejs", { 
      books: result.rows, 
      category,
      sort,
      currentPage: 1,
      totalPages: 1
    });
  } catch (err) {
    console.error("Error searching books:", err);
    res.status(500).send("Error searching books.");
  }
});




app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});