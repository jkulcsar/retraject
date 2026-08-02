	void interrupt handler( __CPPARGS )
	{
		UINT	i;


		// Atentie! Aici cind este vorba despre numarul de diviziuni, se refera
		// la nivel de cupla si nu de traiectorie, adica cite diviziuni are o cupla
		// in TOTAL; evident, numarul de cuante/diviziuni difera de la traiectorie
		// la traiectorie in cadrul unei cuple.
		if( NewDivision() == TRUE )
		{
			for( i=0; i<m_uiNrOfJoints;	i++ )
					c[i] = m_pJoint[i].GetNextTC();
		}


		for( i=0;	i<m_uiNrOfJoints;	i++ )
		{
			c[i]--;
			if( c[i] == 0 )
			{
				// formeaza impuls pentru cupla i astfel:
				// reincarca c pentru cupla i
				c[i] = m_pJoint[i].GetCurrentTC();
			}
		}

		NextQuantum();

		oldhandler();

		if( CommandEnd() == TRUE )
			m_bCommandOK = TRUE;
	}



	BOOL	Robot::Command( void )
	{

			UINT	i,j;

			bCommandOK = FALSE;

		   // set up the variables for command ...
		   ppuiTCA = (UINT**)  new char[  m_uiNrOfJoints * sizeof(UINT*) ];
		   d       = (UINT*)   new UINT[ (m_uiNrOfPoints-1) * m_uiNrOfJoints ];
		   c	   = (UINT*)   new UINT[  m_uiNrOfJoints ];
		   qpd	   = (UINT*)   new UINT[  m_uiNrOfPoints-1 ];

		   if( (m_pJoint != NULL) && (ppuiTCA != NULL ) && (d != NULL) && (c != NULL) && (qpd != NULL) )
		   {
				uiNrOfJoints 		= m_uiNrOfJoints;
				uiNrOfTrajectories 	= m_uiNrOfPoints - 1;
				uiCurrentTrajectory = 0;
				ctdiv				= 0;    // starting trajectory division
				cjdiv				= 0;	// starting joint division
				cqpd				= 0;	// starting the up-counter for quantums/division
				JDivisions = m_pJoint[0].GetNrOfDivisions();
				TDivisions = (UINT) m_pJoint[0].GetNrOfDivisions() / uiNrOfTrajectories ;

			   for( i=0; i<m_uiNrOfJoints; i++ )
					ppuiTCA[i] = m_pJoint[i].GetPointerToTCA();

			   // check out the Time Constants ...
			   for( i=0; i<m_uiNrOfJoints; i++ )
					for( j=0; j<JDivisions; j++ )
						cout<<setw(5)<<(*(ppuiTCA[i] + j));

			   for( i=0; i<m_uiNrOfJoints; i++ )
					for( j=0; j<uiNrOfTrajectories; j++ )
						d[ i*(m_uiNrOfPoints-1) + j ] = m_pJoint[i].GetDirectionForTrajectory( j );

			   for( i=0; i<uiNrOfTrajectories; i++ )
					qpd[i] = m_pJoint[0].GetNQPDForTrajectory( i );

			   // check out the number of quantums/division
			   for( i=0; i<uiNrOfTrajectories; i++ )
					cout<<"\nNQPD for trajectory "<<setw(5)<<i<<":"<<setw(10)<<qpd[i];

				// check out if everything all right, so far:
			   for( i=0; i<m_uiNrOfJoints; i++ )
					for( j=0; j<uiNrOfTrajectories; j++ )
						cout<<"\nDirection for joint/trajectory : "<<d[ i*(m_uiNrOfPoints-1) + j ];

				cout<<"\nNumber of divisions/joint:"<<JDivisions;
				cout<<"\nNumber of divisions/trajectory:"<<TDivisions;

		   }
		   else
			cout<<"Out of memory in Command!";


			/* save the old interrupt vector */
		   oldhandler = getvect(INTR);

		   // set the new interrupt rate
		   ::SetClockTo( m_uiQuantum );


			/* reset the old interrupt handler */
			setvect(INTR, oldhandler);

			// restore old interrupt rate
			::SetClockTo( 0xFFFF );

			// deallocate memory ...
			if( ppuiTCA != NULL )	delete[] ppuiTCA;
			if( d       != NULL )	delete[] d;
			if( c       != NULL )	delete[] c;
			if( qpd	    != NULL )	delete[] qpd;

			return TRUE;
	}
