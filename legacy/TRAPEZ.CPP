
		#ifndef _TRAPEZ_H
		#include "trapez.h"
		#endif

		#ifndef __IOSTREAM_H
		#include <iostream.h>
		#endif

		#ifndef  __MATH_H
		#include <math.h>
		#endif

		#ifndef _ANEXA_H
		#include "anexa.h"
		#endif

		#ifndef _JOINTYP_H
		#include "jointyp.h"
		#endif




		float	Trapez::m_ComputeTrajectoryTime( void )
		{
				float	result;

			if( ABS(D()) > ( pow(m_fKV, 2) / m_fKA ) )
			{
				result = (float)( m_fKV / m_fKA + ABS(D()) / m_fKV );
				if( result >= 0 )
					return result;
				else
					return 0;
			}
			else
				return 0;
		}



		BOOL	Trapez::m_ComputeLambda( void )
		{
				// m_fTrajectoryTime must be found out by the Robot !
				// the Lambda factor is a robot-overall factor .

				float	fTau;

				fTau	= m_fKV / m_fKA;

				if( (m_fTrajectoryTime - fTau) != 0 )
				{
					m_fLambda = (float) ( ( m_ComputeTrajectoryTime() - fTau ) / ( m_fTrajectoryTime - fTau ) );

					// reducing maximum acceleration by the factor m_fLambda
					m_fKA     = (float) m_fKA * m_fLambda;

					return TRUE;
				}
				else
					return FALSE;
		}




	BOOL	Trapez::m_ComputePosition( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array
			float	fTau;

			if( m_uiNrOfValues > 0 )
				m_pfPosition = (float*) new float[ m_uiNrOfValues ];

			if( m_pfPosition != NULL )
			{
				fTau	= m_fKV / m_fKA;
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					if( ABS(D()) > ( pow(m_fKV, 2) / m_fKA ) )
					{
						if( ( time >= 0 ) && ( time <= fTau ) )
							m_pfPosition[i] = ( float )( m_fInitialPosition + 0.5 * pow(time,2) * m_fKA * SGN(D()) );

						if( ( time > fTau ) && ( time <= (m_fTrajectoryTime - fTau) ) )
							m_pfPosition[i] = ( float )( m_fInitialPosition + (time - 0.5*fTau) * m_fKV * SGN(D()) );

						if( ( time > (m_fTrajectoryTime - fTau) ) && ( time <= m_fTrajectoryTime ) )
							m_pfPosition[i] = ( float )( m_fFinalPosition - 0.5*pow( (m_fTrajectoryTime - time), 2 ) * m_fKA * SGN(D()) );
					}
					else
							m_pfPosition[i] = 0;

					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Trapez::m_ComputeSpeed( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array
			float	fTau;

			if( m_uiNrOfValues > 0 )
				m_pfSpeed = (float*) new float[ m_uiNrOfValues ];

			if( m_pfSpeed != NULL )
			{
				fTau = m_fKV / m_fKA;
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					if( ABS(D()) > ( pow(m_fKV, 2) / m_fKA ) )
					{
						if( ( time >= 0 ) && ( time <= fTau ) )
							m_pfSpeed[i] = ( float )( m_fKA * SGN(D()) * time );

						if( ( time > fTau ) && ( time <= (m_fTrajectoryTime - fTau) ) )
							m_pfSpeed[i] = ( float )( m_fKV * SGN(D()) );

						if( ( time > (m_fTrajectoryTime - fTau) ) && ( time <= m_fTrajectoryTime ) )
							m_pfSpeed[i] = ( float )( (m_fTrajectoryTime - time) * m_fKA * SGN(D()) );
					}
					else
							m_pfSpeed[i] = 0;

					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;

	}



	BOOL	Trapez::m_ComputeAcceleration( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array
			float	fTau;

			if( m_uiNrOfValues > 0 )
				m_pfAcceleration = (float*) new float[ m_uiNrOfValues ];

			if( m_pfAcceleration != NULL )
			{
				fTau	= m_fKV / m_fKA;
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					if( ABS(D()) > ( pow(m_fKV, 2) / m_fKA ) )
					{
						if( ( time >= 0 ) && ( time <= fTau ) )
							m_pfAcceleration[i] = ( float )( m_fKA * SGN(D()) );

						if( ( time > fTau ) && ( time <= (m_fTrajectoryTime - fTau) ) )
							m_pfAcceleration[i] = ( float )( 0 );

						if( ( time > (m_fTrajectoryTime - fTau) ) && ( time <= m_fTrajectoryTime ) )
							m_pfAcceleration[i] = ( float )( - m_fKA * SGN(D()) );
					}
					else
							m_pfAcceleration[i] = 0;

					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;

	}



		Trapez::Trapez(  void )
		{
			m_uiType = TRAPEZ;
		}


		Trapez::~Trapez( void )
		{
			// do nothing ...
		}
