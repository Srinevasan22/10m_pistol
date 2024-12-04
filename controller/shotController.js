import Shot from '../model/shot.js';  // Correct way to import a default export

// Add a new shot
export const addShot = async (req, res) => {
  try {
    // Log the incoming request body to verify input
    console.log('Received request body:', req.body);

    // Check if sessionId is present
    if (!req.params.sessionId) {
      console.log('No sessionId provided in request params');
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Create a new Shot object
    const shot = new Shot({ 
      ...req.body, 
      sessionId: req.params.sessionId,
      positionX: req.body.positionX || 0, // Default value for positionX
      positionY: req.body.positionY || 0  // Default value for positionY
    });

    // Log shot details before saving
    console.log('Shot to be saved:', shot);

    // Save the shot to the database
    await shot.save();

    // Log the successful save
    console.log('Shot saved successfully:', shot);

    // Respond with the saved shot
    res.status(201).json(shot);
  } catch (error) {
    // Log the error details
    console.error('Error adding shot:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all shots by session ID
export const getShotsBySession = async (req, res) => {
  try {
    console.log('Fetching shots for sessionId:', req.params.sessionId);
    const shots = await Shot.find({ sessionId: req.params.sessionId });
    res.json(shots);
  } catch (error) {
    console.error('Error fetching shots by session ID:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get a shot by ID
export const getShotById = async (req, res) => {
  try {
    console.log('Fetching shot by shotId:', req.params.shotId);
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) {
      console.log('Shot not found:', req.params.shotId);
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json(shot);
  } catch (error) {
    console.error('Error fetching shot by ID:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Update a shot by ID
export const updateShot = async (req, res) => {
  try {
    console.log('Updating shot with ID:', req.params.shotId);
    const shot = await Shot.findByIdAndUpdate(
      req.params.shotId, 
      { 
        ...req.body,
        positionX: req.body.positionX || 0, // Default value for positionX
        positionY: req.body.positionY || 0  // Default value for positionY
      },
      {
        new: true,
        runValidators: true,
      }
    );
    if (!shot) {
      console.log('Shot not found for update:', req.params.shotId);
      return res.status(404).json({ error: 'Shot not found' });
    }
    console.log('Shot updated successfully:', shot);
    res.json(shot);
  } catch (error) {
    console.error('Error updating shot:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Delete a shot by ID
export const deleteShot = async (req, res) => {
  try {
    console.log('Deleting shot with ID:', req.params.shotId);
    const shot = await Shot.findByIdAndDelete(req.params.shotId);
    if (!shot) {
      console.log('Shot not found for deletion:', req.params.shotId);
      return res.status(404).json({ error: 'Shot not found' });
    }
    console.log('Shot deleted successfully:', req.params.shotId);
    res.json({ message: 'Shot deleted successfully' });
  } catch (error) {
    console.error('Error deleting shot:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Add a new shot to the session
export const addShotToSession = async (req, res) => {
  try {
    const { sessionId, score } = req.body;
    if (!sessionId || !score) {
      console.log('Missing sessionId or score in request body');
      return res.status(400).json({ error: 'Session ID and score are required' });
    }

    const newShot = new Shot({
      sessionId,
      positionX: req.body.positionX || 0, // Default value for positionX
      positionY: req.body.positionY || 0, // Default value for positionY
      score,
      timestamp: new Date(), // Automatically set timestamp
    });

    console.log('Adding new shot to session:', newShot);
    await newShot.save();
    console.log('New shot added successfully:', newShot);

    res.status(201).json(newShot);
  } catch (error) {
    console.error('Error adding shot to session:', error.message);
    res.status(500).json({ error: error.message });
  }
};
