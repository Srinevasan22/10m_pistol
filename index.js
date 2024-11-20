const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const mySecret = process.env['git_secret']

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/pistol_tracking', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Define a route
app.get('/', (req, res) => {
    res.send('Pistol Tracking App Backend');
});

// Start the server - test again
const PORT = 3030;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
